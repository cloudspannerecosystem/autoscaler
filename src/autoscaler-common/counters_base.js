/* Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */

/*
 * Autoscaler Base Counters module
 *
 * Provides basic counters functionality to poller and scaler counters
 * packages
 *
 */
const {MeterProvider, PeriodicExportingMetricReader} =
  require('@opentelemetry/sdk-metrics');
const {Resource} = require('@opentelemetry/resources');
const {MetricExporter: GcpMetricExporter} =
  require('@google-cloud/opentelemetry-cloud-monitoring-exporter');
const {OTLPMetricExporter} =
  require('@opentelemetry/exporter-metrics-otlp-grpc');
const {GcpDetectorSync} =
   require('@google-cloud/opentelemetry-resource-util');
const {SemanticResourceAttributes: Semconv} =
  require('@opentelemetry/semantic-conventions');
const OpenTelemetryApi = require('@opentelemetry/api');
const OpenTelemetryCore = require('@opentelemetry/core');
const {setTimeout} = require('timers/promises');
const {logger} = require('./logger.js');

/**
 * @typedef {{
 *    counterName: string,
 *    counterDesc: string,
 * }} CounterDefinition
 */

/**
 * @typedef {{
*    [x: string]: string,
* }} CounterAttributes
*/


const RESOURCE_ATTRIBUTES = {
  [Semconv.SERVICE_NAMESPACE]: 'cloudspannerecosystem',
  [Semconv.SERVICE_NAME]: 'autoscaler',
  [Semconv.SERVICE_VERSION]: '1.0',
};

const COUNTER_ATTRIBUTE_NAMES = {
  SPANNER_PROJECT_ID: 'spanner_project_id',
  SPANNER_INSTANCE_ID: 'spanner_instance_id',
};

/**
 * The prefix to use for any autoscaler counters.
 */
const COUNTERS_PREFIX =
  RESOURCE_ATTRIBUTES[Semconv.SERVICE_NAMESPACE] +
  '/' +
  RESOURCE_ATTRIBUTES[Semconv.SERVICE_NAME] +
  '/';


/** @enum{String} */
const ExporterMode = {
  GCM_ONLY_FLUSHING: 'GCM_ONLY_FLUSHING',
  OTEL_PERIODIC: 'OTEL_PERIODIC',
  OTEL_ONLY_FLUSHING: 'OTEL_ONLY_FLUSHING',
};


const EXPORTER_PARAMETERS = {
  // GCM direct pushing is only done in Cloud functions deployments, where
  // we only flush directly.
  //
  [ExporterMode.GCM_ONLY_FLUSHING]: {
    PERIODIC_EXPORT_INTERVAL: 0x7FFFFFFF, // approx 24 days in milliseconds
    FLUSH_MIN_INTERVAL: 10_000,
    FLUSH_MAX_ATTEMPTS: 6,
    FLUSH_ENABLED: true,
  },

  // OTEL collector cannot handle receiving metrics from a single process
  // more frequently than its batching timeout, as it does not aggregate
  // them and reports the multiple metrics to the upstream metrics management
  // interface (eg GCM) which will then cause Duplicate TimeSeries errors.
  //
  // So when using flushing, disable periodic export, and when using periodic
  // export, disable flushing!
  //
  // OTEL collector mode is set by specifying the environment variable
  // OTEL_COLLECTOR_URL which is the address of the collector,
  // and whether to use flushing or periodic export is determined
  // by the environment variable OTEL_IS_LONG_RUNNING_PROCESS
  [ExporterMode.OTEL_ONLY_FLUSHING]: {
    PERIODIC_EXPORT_INTERVAL: 0x7FFFFFFF, // approx 24 days in milliseconds
    FLUSH_MIN_INTERVAL: 15_000,
    FLUSH_MAX_ATTEMPTS: 6,
    FLUSH_ENABLED: true,
  },
  [ExporterMode.OTEL_PERIODIC]: {
    PERIODIC_EXPORT_INTERVAL: 20_000, // OTEL collector batches every 10s
    FLUSH_MIN_INTERVAL: 0,
    FLUSH_MAX_ATTEMPTS: 0,
    FLUSH_ENABLED: false,
  },
};

/** @type {ExporterMode} */
let exporterMode;

/**
 * Global counters object, populated by createCounters.
 *
 * @type {Map<String,OpenTelemetryApi.Counter>} counter Name to counter instance
 */
const COUNTERS = new Map();

/**
 * @type {MeterProvider}
 */
let meterProvider;

/**
 * @type {Promise<void>} that will be fulfilled when init is complete
 */
let pendingInit;

/**
 * Wrapper class for OpenTelemetry DiagLogger to convert to Bunyan log levels
 *
 * @extends {OpenTelemetryApi.DiagLogger}
 */
class DiagToBunyanLogger {
  /** @constructor */
  constructor() {
    // In some cases where errors may be expected, we want to be able to supress
    // them.
    this.suppressErrors = false;
  }

  // eslint-disable-next-line require-jsdoc
  verbose(message, ...args) {
    logger.trace('otel: '+message, args);
  }
  // eslint-disable-next-line require-jsdoc
  debug(message, ...args) {
    logger.debug('otel: '+message, args);
  }
  // eslint-disable-next-line require-jsdoc
  info(message, ...args) {
    logger.info('otel: '+message, args);
  }
  // eslint-disable-next-line require-jsdoc
  warn(message, ...args) {
    logger.warn('otel: '+message, args);
  }
  // eslint-disable-next-line require-jsdoc
  error(message, ...args) {
    if ( ! this.suppressErrors ) {
      logger.error('otel: '+message, args);
    }
  }
};

const DIAG_BUNYAN_LOGGER = new DiagToBunyanLogger();

/**
 * Number of errors reported by OpenTelemetry. Used by tryFlush() to detect
 * if the flush suceeded or not.
 */
let openTelemetryErrorCount = 0;

/**
 * Global Error hander function for open Telemetry. Keeps a track of the
 * number of errors reported.
 *
 * @param {Object} err
 */
function openTelemetryGlobalErrorHandler(err) {
  openTelemetryErrorCount++;
  // delegate to Otel's own error handler for stringification
  OpenTelemetryCore.loggingErrorHandler()(err);
}


// Setup OpenTelemetry client libraries logging.
OpenTelemetryApi.default.diag.setLogger(
    DIAG_BUNYAN_LOGGER,
    {
      logLevel: OpenTelemetryApi.DiagLogLevel.INFO,
      suppressOverrideMessage: true,
    });
OpenTelemetryCore.setGlobalErrorHandler(openTelemetryGlobalErrorHandler);


/**
 * Initialize the OpenTelemetry metrics, set up logging
 *
 * If called more than once, will wait for the first call to complete.
 *
 * @return {!Promise<void>}
 */
async function initMetrics() {
  // check to see if someone else has started to init counters before
  // so that this function only runs once.
  if (pendingInit) {
    return await pendingInit;
  }

  /** @type {?function():void} */
  let resolvePendingInit = null;
  /** @type {?function(?):void} */
  let rejectPendingInit = null;
  pendingInit = new Promise((res, rej) => {
    resolvePendingInit = res;
    rejectPendingInit = rej;
  });


  try {
    logger.debug('initializing metrics');

    if (process.env.KUBERNETES_SERVICE_HOST) {
      // In K8s. We need to set the Pod Name to prevent duplicate
      // timeseries errors.
      if (process.env.K8S_POD_NAME) {
        RESOURCE_ATTRIBUTES[
            Semconv.K8S_POD_NAME] =
            process.env.K8S_POD_NAME;
      } else {
        logger.warn('WARNING: running under Kubernetes, but K8S_POD_NAME ' +
        'environment variable is not set. ' +
        'This may lead to Send TimeSeries errors');
      }
    }

    const gcpResources = new GcpDetectorSync().detect();
    await gcpResources.waitForAsyncAttributes();

    if (process.env.FUNCTION_TARGET) {
      // In cloud functions.
      // We need to set the platform to generic_task so that the
      // function instance ID gets set in the  counter resource attributes.
      // For details, see
      // https://github.com/GoogleCloudPlatform/opentelemetry-operations-js/issues/679
      RESOURCE_ATTRIBUTES[Semconv.CLOUD_PLATFORM] = 'generic_task';

      if (gcpResources.attributes[Semconv.FAAS_ID]?.toString()) {
        RESOURCE_ATTRIBUTES[Semconv.SERVICE_INSTANCE_ID] =
            gcpResources.attributes[Semconv.FAAS_ID].toString();
      } else {
        logger.warn('WARNING: running under Cloud Functions, but FAAS_ID ' +
        'resource attribute is not set. ' +
        'This may lead to Send TimeSeries errors');
      }
    }

    const resources = gcpResources.merge(new Resource(RESOURCE_ATTRIBUTES));
    await resources.waitForAsyncAttributes();

    let exporter;
    if (process.env.OTEL_COLLECTOR_URL) {
      switch (process.env.OTEL_IS_LONG_RUNNING_PROCESS) {
        case 'true':
          exporterMode = ExporterMode.OTEL_PERIODIC;
          break;
        case 'false':
          exporterMode = ExporterMode.OTEL_ONLY_FLUSHING;
          break;
        default:
          throw new Error(
              `Invalid value for env var OTEL_IS_LONG_RUNNING_PROCESS: "${
                process.env.OTEL_IS_LONG_RUNNING_PROCESS}"`);
      }
      logger.info(`Counters mode: ${exporterMode} OTEL collector: ${
        process.env.OTEL_COLLECTOR_URL}`);
      exporter = new OTLPMetricExporter({url: process.env.OTEL_COLLECTOR_URL});
    } else {
      exporterMode = ExporterMode.GCM_ONLY_FLUSHING;
      logger.info(`Counters mode: ${exporterMode} using GCP monitoring`);
      exporter = new GcpMetricExporter({prefix: 'custom.googleapis.com'});
    }

    meterProvider = new MeterProvider({
      resource: resources,
      readers: [
        new PeriodicExportingMetricReader({
          exportIntervalMillis: EXPORTER_PARAMETERS[exporterMode]
              .PERIODIC_EXPORT_INTERVAL,
          exportTimeoutMillis: EXPORTER_PARAMETERS[exporterMode]
              .PERIODIC_EXPORT_INTERVAL,
          exporter: exporter,
        }),
      ],
    });
  } catch (e) {
    // report failures to other waiters.
    rejectPendingInit(e);
    throw (e);
  }
  resolvePendingInit();
}


/**
 * Initialize metrics with cloud monitoring
 *
 * Note: counterName must be unique.
 *
 * @param {CounterDefinition[]} counterDefinitions
 *
 * @return {!Promise<void>}
 */
async function createCounters(counterDefinitions) {
  await initMetrics();

  const meter = meterProvider.getMeter(COUNTERS_PREFIX);

  for (const counterDef of counterDefinitions) {
    if (!counterDef.counterName || !counterDef.counterDesc) {
      throw new Error('invalid counter definition: ' +
        JSON.stringify(counterDef));
    }
    if (COUNTERS.get(counterDef.counterName)) {
      throw new Error('Counter already created: ' + counterDef.counterName);
    }
    COUNTERS.set(counterDef.counterName,
        meter.createCounter(COUNTERS_PREFIX + counterDef.counterName,
            {description: counterDef.counterDesc}));
  }
}

/**
 * Increment a counter.
 *
 * @param {string} counterName
 * @param {OpenTelemetryApi.Attributes} [counterAttributes]
 */
function incCounter(counterName, counterAttributes) {
  const counter = COUNTERS.get(counterName);
  if (!counter) {
    throw new Error('Unknown counter: ' + counterName);
  }
  counter.add(1, counterAttributes);
}


let lastForceFlushTime = 0;
let flushInProgress;
let tryFlushEnabled = true;

/**
 * Try to flush any as-yet-unsent counters to cloud montioring.
 * if setTryFlushEnabled(false) has been called, this function is a no-op.
 *
 * Will only actually call forceFlush once every MIN_FORCE_FLUSH_INTERVAL
 * seconds. It will retry if an error is detected during flushing.
 *
 * (Note on transient errors: in a long running process, these are not an
 * issue as periodic export will succeed next time, but in short-lived
 * processes there is not a 'next time', so we need to check for errors
 * and retry)
 */
async function tryFlush() {
  await pendingInit;

  if (!tryFlushEnabled || !EXPORTER_PARAMETERS[exporterMode].FLUSH_ENABLED) {
    // flushing disabled, do nothing!
    return;
  }

  // Avoid simultaneous flushing!
  if (flushInProgress) {
    return await flushInProgress;
  }

  /** @type {function(Void):Void} */
  let resolveFlushInProgress;
  flushInProgress = new Promise((res) => {
    resolveFlushInProgress = res;
  });

  try {
    // If flushed recently, wait for the min interval to pass.
    const millisUntilNextForceFlush = lastForceFlushTime +
      EXPORTER_PARAMETERS[exporterMode].FLUSH_MIN_INTERVAL -
      Date.now();

    if (millisUntilNextForceFlush > 0) {
      // wait until we can force flush again!
      logger.debug('Counters.tryFlush() waiting until flushing again');
      await setTimeout(millisUntilNextForceFlush);
    }


    // OpenTelemetry's forceFlush() will always succeed, even if the backend
    // fails and reports an error...
    //
    // So we use the OpenTelemetry Global Error Handler installed above
    // to keep a count of the number of errors reported, and if an error
    // is reported during a flush, we wait a while and try again.
    // Not perfect, but the best we can do.
    //
    // To avoid end-users seeing these errors, we supress error messages
    // until the very last flush attempt.
    //
    // Note that if the OpenTelemetry metrics are exported to Google Cloud
    // Monitoring, the first time a counter is used, it will fail to be
    // exported and will need to be retried.
    let attempts = EXPORTER_PARAMETERS[exporterMode].FLUSH_MAX_ATTEMPTS;
    while (attempts > 0) {
      const oldOpenTelemetryErrorCount = openTelemetryErrorCount;

      // Suppress OTEL Diag error messages on all but the last flush attempt.
      DIAG_BUNYAN_LOGGER.suppressErrors = (attempts > 1);
      await meterProvider.forceFlush();
      DIAG_BUNYAN_LOGGER.suppressErrors = false;

      lastForceFlushTime = Date.now();

      if (oldOpenTelemetryErrorCount === openTelemetryErrorCount) {
        // success!
        return;
      } else {
        logger.warn('Opentelemetry reported errors during flushing, retrying.');
      }
      await setTimeout(EXPORTER_PARAMETERS[exporterMode].FLUSH_MIN_INTERVAL);
      attempts--;
    }
    if (attempts <= 0) {
      logger.error(`Failed to flush counters after ${
        EXPORTER_PARAMETERS[exporterMode].FLUSH_MAX_ATTEMPTS
      } attempts - see OpenTelemetry logging`);
    }
  } catch (err) {
    logger.error({err: err, message: `Error while flushing counters: ${err}`});
  } finally {
    // Release any waiters...
    resolveFlushInProgress();
    flushInProgress = null;
  }
}

/**
 * Specify whether the tryFlush function should try to flush or not.
*
 * In long-running processes, disabling flushing will give better results
 * while in short-lived processes, without flushing, counters may not
 * be reported to cloud monitoring.
 *
 * @param {boolean} newTryFlushEnabled
 */
function setTryFlushEnabled(newTryFlushEnabled) {
  tryFlushEnabled = !!newTryFlushEnabled;
}

module.exports = {
  COUNTER_ATTRIBUTE_NAMES,
  createCounters,
  incCounter,
  tryFlush,
  setTryFlushEnabled,
};
