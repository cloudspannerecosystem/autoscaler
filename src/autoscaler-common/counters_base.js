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
const {SemanticResourceAttributes} =
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


const AUTOSCALER_RESOURCE_ATTRIBUTES = {
  [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'cloudspannerecosystem',
  [SemanticResourceAttributes.SERVICE_NAME]: 'autoscaler',
  [SemanticResourceAttributes.SERVICE_VERSION]: '1.0',
};

const COUNTER_ATTRIBUTE_NAMES = {
  SPANNER_PROJECT_ID: 'spanner_project_id',
  SPANNER_INSTANCE_ID: 'spanner_project_id',
};

/**
 * The prefix to use for any autoscaler counters.
 */
const COUNTERS_PREFIX =
  AUTOSCALER_RESOURCE_ATTRIBUTES[SemanticResourceAttributes.SERVICE_NAMESPACE] +
  '/' +
  AUTOSCALER_RESOURCE_ATTRIBUTES[SemanticResourceAttributes.SERVICE_NAME] +
  '/';


/** Opentelemetry counters parameters */
const PERIODIC_FLUSH_INTERVAL = 30_000;
const MIN_FORCE_FLUSH_INTERVAL = 10_000;
const MAX_FORCE_FLUSH_ATTEMPTS = 6;


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
  // eslint-disable-next-line require-jsdoc
  verbose(message, ...args) {
    logger.trace(message, args);
  }
  // eslint-disable-next-line require-jsdoc
  debug(message, ...args) {
    logger.debug(message, args);
  }
  // eslint-disable-next-line require-jsdoc
  info(message, ...args) {
    logger.info(message, args);
  }
  // eslint-disable-next-line require-jsdoc
  warn(message, ...args) {
    logger.warn(message, args);
  }
  // eslint-disable-next-line require-jsdoc
  error(message, ...args) {
    logger.error(message, args);
  }
};


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
  if (err instanceof Error) {
    logger.error({message: 'OpenTelemetry: ' + err.message, err: err});
  } else {
    // delegate to Otel's own error handler for stringification
    OpenTelemetryCore.loggingErrorHandler()(err);
  }
}


// Setup OpenTelemetry client libraries logging.
OpenTelemetryApi.default.diag.setLogger(
    new DiagToBunyanLogger(),
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

    const gcpResources = new GcpDetectorSync().detect();
    await gcpResources.waitForAsyncAttributes();
    logger.debug('got GCP resources %o', gcpResources);


    if (process.env.KUBERNETES_SERVICE_HOST) {
      if (process.env.K8S_POD_NAME) {
        gcpResources[SemanticResourceAttributes.K8S_POD_NAME] =
            process.env.K8S_POD_NAME;
      } else {
        logger.warn('WARNING: running under Kubernetes, but K8S_POD_NAME ' +
        'environment variable is not set. ' +
        'This may lead to duplicate TimeSeries errors');
      }
    }

    let exporter;
    if (process.env.OLTP_COLLECTOR_URL) {
      logger.info(`Counters using OLTP Metrics exporter to ${
        process.env.OLTP_COLLECTOR_URL}`);
      exporter = new OTLPMetricExporter({url: process.env.OLTP_COLLECTOR_URL});
    } else {
      logger.info('Counters exporting directly to GCP monitoring');
      exporter = new GcpMetricExporter();
    }

    meterProvider = new MeterProvider({
      resource: new Resource(AUTOSCALER_RESOURCE_ATTRIBUTES)
          .merge(gcpResources),
      readers: [
        new PeriodicExportingMetricReader({
          exportIntervalMillis: PERIODIC_FLUSH_INTERVAL,
          exportTimeoutMillis: PERIODIC_FLUSH_INTERVAL,
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
  if (!tryFlushEnabled) {
    // flushing disabled, do nothing!
    return;
  }

  // check for if we are initialised
  await pendingInit;

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
      MIN_FORCE_FLUSH_INTERVAL -
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
    // Note that if the OpenTelemetry metrics are exported to Google Cloud
    // Monitoring, the first time a counter is used, it will fail to be
    // exported and will need to be retried.
    let attempts = MAX_FORCE_FLUSH_ATTEMPTS;
    while (attempts > 0) {
      const oldOpenTelemetryErrorCount = openTelemetryErrorCount;
      await meterProvider.forceFlush();
      lastForceFlushTime = Date.now();

      if (oldOpenTelemetryErrorCount === openTelemetryErrorCount) {
        logger.info('Counters sent.');
        return;
      } else {
        logger.warn('Opentelemetry errors during flushing - see logs');
      }
      await setTimeout(MIN_FORCE_FLUSH_INTERVAL);
      attempts--;
    }
    if (attempts <= 0) {
      logger.error(`Failed to flush counters after ${
        MAX_FORCE_FLUSH_ATTEMPTS} attempts - see OpenTelemetry logging`);
    }
  } catch (e) {
    logger.error('Error while flushing counters', e);
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
