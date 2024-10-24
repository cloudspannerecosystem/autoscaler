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
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const {Resource} = require('@opentelemetry/resources');
const {
  MetricExporter: GcpMetricExporter,
} = require('@google-cloud/opentelemetry-cloud-monitoring-exporter');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-grpc');
const {GcpDetectorSync} = require('@google-cloud/opentelemetry-resource-util');
const Semconv = require('@opentelemetry/semantic-conventions');
const OpenTelemetryApi = require('@opentelemetry/api');
const OpenTelemetryCore = require('@opentelemetry/core');
const {setTimeout} = require('timers/promises');
const {logger} = require('./logger.js');
const PromiseWithResolvers = require('./promiseWithResolvers.js');
const {version: packageVersion} = require('../../package.json');

/**
 * @typedef {{
 *    counterName: string,
 *    counterDesc: string,
 *    counterType?: "CUMULATIVE" | "HISTOGRAM" // default=COUNTER
 *    counterUnits?: string
 *    counterHistogramBuckets?: number[]
 * }} CounterDefinition
 */

/**
 * @typedef {{
 *    [x: string]: string,
 * }} CounterAttributes
 */
/** @type {CounterAttributes} */
const RESOURCE_ATTRIBUTES = {
  [Semconv.SEMRESATTRS_SERVICE_NAMESPACE]: 'cloudspannerecosystem',
  [Semconv.SEMRESATTRS_SERVICE_NAME]: 'autoscaler',
  [Semconv.SEMRESATTRS_SERVICE_VERSION]: packageVersion,
};

const COUNTER_ATTRIBUTE_NAMES = {
  SPANNER_PROJECT_ID: 'spanner_project_id',
  SPANNER_INSTANCE_ID: 'spanner_instance_id',
};

/**
 * The prefix to use for any autoscaler counters.
 */
const COUNTERS_PREFIX =
  RESOURCE_ATTRIBUTES[Semconv.SEMRESATTRS_SERVICE_NAMESPACE] +
  '/' +
  RESOURCE_ATTRIBUTES[Semconv.SEMRESATTRS_SERVICE_NAME] +
  '/';

/** @enum{String} */
const ExporterMode = {
  GCM_ONLY_FLUSHING: 'GCM_ONLY_FLUSHING',
  OTEL_PERIODIC: 'OTEL_PERIODIC',
  OTEL_ONLY_FLUSHING: 'OTEL_ONLY_FLUSHING',
};

const EXPORTER_PARAMETERS = {
  // GCM direct pushing is only done in Cloud Run functions deployments, where
  // we only flush directly.
  //
  [ExporterMode.GCM_ONLY_FLUSHING]: {
    PERIODIC_EXPORT_INTERVAL: 0x7fffffff, // approx 24 days in milliseconds
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
    PERIODIC_EXPORT_INTERVAL: 0x7fffffff, // approx 24 days in milliseconds
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
 * @type {Map<
 *    String,
 *    {
 *      cumulative?: OpenTelemetryApi.Counter,
 *      histogram?: OpenTelemetryApi.Histogram
 *    }
 *  >} counter Name to counter instance
 */
const COUNTERS = new Map();

/**
 * @type {MeterProvider}
 */
let meterProvider;

/** @type {PromiseWithResolvers.PromiseWithResolvers?} */
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

  /**
   * @param {string} message
   * @param {any[]} args
   */
  verbose(message, ...args) {
    logger.trace('otel: ' + message, args);
  }

  /**
   * @param {string} message
   * @param {any[]} args
   */
  debug(message, ...args) {
    logger.debug('otel: ' + message, args);
  }
  /**
   * @param {string} message
   * @param {any[]} args
   */
  info(message, ...args) {
    logger.info('otel: ' + message, args);
  }
  /**
   * @param {string} message
   * @param {any[]} args
   */
  warn(message, ...args) {
    logger.warn('otel: ' + message, args);
  }
  // eslint-disable-next-line require-jsdoc
  /**
   * @param {string} message
   * @param {any[]} args
   */
  error(message, ...args) {
    if (!this.suppressErrors) {
      logger.error('otel: ' + message, args);
    }
  }
}

const DIAG_BUNYAN_LOGGER = new DiagToBunyanLogger();

/**
 * Number of errors reported by OpenTelemetry. Used by tryFlush() to detect
 * if the flush suceeded or not.
 */
let openTelemetryErrorCount = 0;

/** @typedef {import('@opentelemetry/api').Exception} Exception */

/**
 * Global Error hander function for open Telemetry. Keeps a track of the
 * number of errors reported.
 *
 * @param {Exception} err
 */
function openTelemetryGlobalErrorHandler(err) {
  openTelemetryErrorCount++;
  // delegate to Otel's own error handler for stringification
  OpenTelemetryCore.loggingErrorHandler()(err);
}

// Setup OpenTelemetry client libraries logging.
OpenTelemetryApi.default.diag.setLogger(DIAG_BUNYAN_LOGGER, {
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
    return await pendingInit.promise;
  }
  pendingInit = PromiseWithResolvers.create();

  try {
    logger.debug('initializing metrics');

    if (process.env.KUBERNETES_SERVICE_HOST) {
      // In K8s. We need to set the Pod Name to prevent duplicate
      // timeseries errors.
      if (process.env.K8S_POD_NAME) {
        RESOURCE_ATTRIBUTES[Semconv.SEMRESATTRS_K8S_POD_NAME] =
          process.env.K8S_POD_NAME;
      } else {
        logger.warn(
          'WARNING: running under Kubernetes, but K8S_POD_NAME ' +
            'environment variable is not set. ' +
            'This may lead to Send TimeSeries errors',
        );
      }
    }

    const resources = new GcpDetectorSync()
      .detect()
      .merge(new Resource(RESOURCE_ATTRIBUTES));
    if (resources.waitForAsyncAttributes) {
      await resources.waitForAsyncAttributes();
    }

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
            `Invalid value for env var OTEL_IS_LONG_RUNNING_PROCESS: "${process.env.OTEL_IS_LONG_RUNNING_PROCESS}"`,
          );
      }
      logger.info(
        `Counters mode: ${exporterMode} OTEL collector: ${process.env.OTEL_COLLECTOR_URL}`,
      );
      exporter = new OTLPMetricExporter({
        url: process.env.OTEL_COLLECTOR_URL,
        // @ts-ignore -- CompressionAlgorithm.NONE (='none') is not exported.
        compression: 'none',
      });
    } else {
      exporterMode = ExporterMode.GCM_ONLY_FLUSHING;
      logger.info(`Counters mode: ${exporterMode} using GCP monitoring`);
      exporter = new GcpMetricExporter({prefix: 'workload.googleapis.com'});
    }

    meterProvider = new MeterProvider({
      resource: resources,
      readers: [
        new PeriodicExportingMetricReader({
          exportIntervalMillis:
            EXPORTER_PARAMETERS[exporterMode].PERIODIC_EXPORT_INTERVAL,
          exportTimeoutMillis:
            EXPORTER_PARAMETERS[exporterMode].PERIODIC_EXPORT_INTERVAL,
          exporter: exporter,
        }),
      ],
    });
  } catch (e) {
    // report failures to other waiters.
    pendingInit.reject(e);
    throw e;
  }
  pendingInit.resolve(null);
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
      throw new Error(
        'invalid counter definition: ' + JSON.stringify(counterDef),
      );
    }
    if (COUNTERS.get(counterDef.counterName)) {
      throw new Error('Counter already created: ' + counterDef.counterName);
    }
    switch (counterDef.counterType || 'CUMULATIVE') {
      case 'CUMULATIVE':
        COUNTERS.set(counterDef.counterName, {
          cumulative: meter.createCounter(
            COUNTERS_PREFIX + counterDef.counterName,
            {
              description: counterDef.counterDesc,
              unit: counterDef.counterUnits,
            },
          ),
        });
        break;
      case 'HISTOGRAM':
        COUNTERS.set(counterDef.counterName, {
          histogram: meter.createHistogram(
            COUNTERS_PREFIX + counterDef.counterName,
            {
              description: counterDef.counterDesc,
              unit: counterDef.counterUnits,
              advice: {
                explicitBucketBoundaries: counterDef.counterHistogramBuckets,
              },
            },
          ),
        });
        break;
      default:
        throw new Error(
          `Invalid counter type for ${counterDef.counterName}: ${counterDef.counterType}`,
        );
    }
  }
}

/**
 * Increment a cumulative counter.
 *
 * @param {string} counterName
 * @param {OpenTelemetryApi.Attributes} [counterAttributes]
 */
function incCounter(counterName, counterAttributes) {
  const counter = COUNTERS.get(counterName);
  if (!counter?.cumulative) {
    throw new Error('Unknown counter: ' + counterName);
  }
  counter.cumulative.add(1, counterAttributes);
}

/**
 * Record a histogram counter value.
 *
 * @param {string} counterName
 * @param {number} value
 * @param {OpenTelemetryApi.Attributes} [counterAttributes]
 */
function recordValue(counterName, value, counterAttributes) {
  const counter = COUNTERS.get(counterName);
  if (!counter?.histogram) {
    throw new Error('Unknown counter: ' + counterName);
  }
  counter.histogram.record(value, counterAttributes);
}

let lastForceFlushTime = 0;
/** @type {PromiseWithResolvers.PromiseWithResolvers?} */
let flushInProgress = null;
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
  // check for if we are initialised
  await pendingInit?.promise;

  if (!tryFlushEnabled || !EXPORTER_PARAMETERS[exporterMode].FLUSH_ENABLED) {
    // flushing disabled, do nothing!
    return;
  }

  // Avoid simultaneous flushing!
  if (flushInProgress) {
    return await flushInProgress.promise;
  }

  flushInProgress = PromiseWithResolvers.create();

  try {
    // If flushed recently, wait for the min interval to pass.
    const millisUntilNextForceFlush =
      lastForceFlushTime +
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
      DIAG_BUNYAN_LOGGER.suppressErrors = attempts > 1;
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
      logger.error(
        `Failed to flush counters after ${EXPORTER_PARAMETERS[exporterMode].FLUSH_MAX_ATTEMPTS} attempts - see OpenTelemetry logging`,
      );
    }
  } catch (err) {
    logger.error({err: err, message: `Error while flushing counters: ${err}`});
  } finally {
    // Release any waiters...
    flushInProgress.resolve(null);
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
  recordValue,
  tryFlush,
  setTryFlushEnabled,
};
