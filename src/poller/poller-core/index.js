/* Copyright 2020 Google LLC
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
 * Autoscaler Poller function
 *
 * * Polls one or more Spanner instances for metrics.
 * * Sends metrics to Scaler to determine if an instance needs to be autoscaled
 */

const axios = require('axios').default;
// eslint-disable-next-line no-unused-vars -- for type checking only.
const express = require('express');
const monitoring = require('@google-cloud/monitoring');
const {PubSub} = require('@google-cloud/pubsub');
const {Spanner} = require('@google-cloud/spanner');
const {logger} = require('../../autoscaler-common/logger');
const Counters = require('./counters.js');
const {AutoscalerUnits} = require('../../autoscaler-common/types');
const assertDefined = require('../../autoscaler-common/assertDefined');
const {version: packageVersion} = require('../../../package.json');
const {parseAndValidateConfig} = require('./validateConfig');

/**
 * @typedef {import('../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 * @typedef {import('../../autoscaler-common/types').SpannerConfig
 * } SpannerConfig
 * @typedef {import('../../autoscaler-common/types').SpannerMetadata
 * } SpannerMetadata
 * @typedef {import('../../autoscaler-common/types').SpannerMetricValue
 * } SpannerMetricValue
 * @typedef {import('../../autoscaler-common/types').SpannerMetric
 * } SpannerMetric
 */

// GCP service clients
const metricsClient = new monitoring.MetricServiceClient();
const pubSub = new PubSub();
const baseDefaults = {
  units: AutoscalerUnits.NODES,
  scaleOutCoolingMinutes: 5,
  scaleInCoolingMinutes: 30,
  scalingMethod: 'STEPWISE',
};
const nodesDefaults = {
  units: AutoscalerUnits.NODES,
  minSize: 1,
  maxSize: 3,
  stepSize: 2,
  overloadStepSize: 5,
};
const processingUnitsDefaults = {
  units: AutoscalerUnits.PROCESSING_UNITS,
  minSize: 100,
  maxSize: 2000,
  stepSize: 200,
  overloadStepSize: 500,
};
const metricDefaults = {
  period: 60,
  aligner: 'ALIGN_MAX',
  reducer: 'REDUCE_SUM',
};
const DEFAULT_THRESHOLD_MARGIN = 5;

/**
 * Build the list of metrics to request
 *
 * @param {string} projectId
 * @param {string} instanceId
 * @return {SpannerMetric[]} metrics to request
 */
function buildMetrics(projectId, instanceId) {
  // Recommended alerting policies
  // https://cloud.google.com/spanner/docs/monitoring-stackdriver#create-alert
  /** @type {SpannerMetric[]} */
  const metrics = [
    {
      name: 'high_priority_cpu',
      filter:
        createBaseFilter(projectId, instanceId) +
        'metric.type=' +
        '"spanner.googleapis.com/instance/cpu/utilization_by_priority" ' +
        'AND metric.label.priority="high"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 65,
      multi_regional_threshold: 45,
    },
    {
      name: 'rolling_24_hr',
      filter:
        createBaseFilter(projectId, instanceId) +
        'metric.type=' +
        '"spanner.googleapis.com/instance/cpu/smoothed_utilization"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 90,
      multi_regional_threshold: 90,
    },
    {
      name: 'storage',
      filter:
        createBaseFilter(projectId, instanceId) +
        'metric.type="spanner.googleapis.com/instance/storage/utilization"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 75,
      multi_regional_threshold: 75,
    },
  ];

  return metrics;
}

/**
 * Creates the base filter that should be prepended to all metric filters
 * @param {string} projectId
 * @param {string} instanceId
 * @return {string} filter
 */
function createBaseFilter(projectId, instanceId) {
  return (
    'resource.labels.instance_id="' +
    instanceId +
    '" AND ' +
    'resource.type="spanner_instance" AND ' +
    'project="' +
    projectId +
    '" AND '
  );
}

/**
 * Checks to make sure required fields are present and populated
 *
 * @param {SpannerMetric} metric
 * @param {string} projectId
 * @param {string} instanceId
 * @return {boolean}
 */
function validateCustomMetric(metric, projectId, instanceId) {
  if (!metric.name) {
    logger.info({
      message: 'Missing name parameter for custom metric.',
      projectId: projectId,
      instanceId: instanceId,
    });
    return false;
  }

  if (!metric.filter) {
    logger.info({
      message: 'Missing filter parameter for custom metric.',
      projectId: projectId,
      instanceId: instanceId,
    });
    return false;
  }

  if (!(metric.regional_threshold > 0 || metric.multi_regional_threshold > 0)) {
    logger.info({
      message:
        'Missing regional_threshold or multi_multi_regional_threshold ' +
        'parameter for custom metric.',
      projectId: projectId,
      instanceId: instanceId,
    });
    return false;
  }

  return true;
}

/**
 * Get max value of metric over a window
 *
 * @param {string} projectId
 * @param {string} spannerInstanceId
 * @param {SpannerMetric} metric
 * @return {Promise<[number,string]>}
 */
function getMaxMetricValue(projectId, spannerInstanceId, metric) {
  const metricWindow = 5;
  logger.debug({
    message: `Get max ${metric.name} from ${projectId}/${spannerInstanceId} over ${metricWindow} minutes.`,
    projectId: projectId,
    instanceId: spannerInstanceId,
  });

  /** @type {monitoring.protos.google.monitoring.v3.IListTimeSeriesRequest} */
  const request = {
    name: 'projects/' + projectId,
    filter: metric.filter,
    interval: {
      startTime: {
        seconds: Date.now() / 1000 - metric.period * metricWindow,
      },
      endTime: {
        seconds: Date.now() / 1000,
      },
    },
    aggregation: {
      alignmentPeriod: {
        seconds: metric.period,
      },
      // @ts-ignore
      crossSeriesReducer: metric.reducer,
      // @ts-ignore
      perSeriesAligner: metric.aligner,
      groupByFields: ['resource.location'],
    },
    view: 'FULL',
  };

  return metricsClient.listTimeSeries(request).then((metricResponses) => {
    const resources = metricResponses[0];
    let maxValue = 0.0;
    let maxLocation = 'global';

    for (const resource of resources) {
      for (const point of assertDefined(resource.points)) {
        const value = assertDefined(point.value?.doubleValue) * 100;
        if (value > maxValue) {
          maxValue = value;
          if (resource.resource?.labels?.location) {
            maxLocation = resource.resource.labels.location;
          }
        }
      }
    }

    return [maxValue, maxLocation];
  });
}

/**
 * Get metadata for spanner instance
 *
 * @param {string} projectId
 * @param {string} spannerInstanceId
 * @param {AutoscalerUnits} units NODES or PU
 * @return {Promise<SpannerMetadata>}
 */
async function getSpannerMetadata(projectId, spannerInstanceId, units) {
  logger.info({
    message: `----- ${projectId}/${spannerInstanceId}: Getting Metadata -----`,
    projectId: projectId,
    instanceId: spannerInstanceId,
  });

  const spanner = new Spanner({
    projectId: projectId,
    // @ts-ignore -- hidden property of ServiceOptions.
    userAgent: `cloud-solutions/spanner-autoscaler-poller-usage-v${packageVersion}`,
  });

  try {
    const spannerInstance = spanner.instance(spannerInstanceId);

    const results = await Promise.all([
      spannerInstance.getDatabases(),
      spannerInstance.getMetadata(),
    ]);
    const numDatabases = results[0][0].length;
    const metadata = results[1][0];
    logger.debug({
      message: `DisplayName:     ${metadata['displayName']}`,
      projectId: projectId,
      instanceId: spannerInstanceId,
    });
    logger.debug({
      message: `NodeCount:       ${metadata['nodeCount']}`,
      projectId: projectId,
      instanceId: spannerInstanceId,
    });
    logger.debug({
      message: `ProcessingUnits: ${metadata['processingUnits']}`,
      projectId: projectId,
      instanceId: spannerInstanceId,
    });
    logger.debug({
      message: `Config:          ${metadata['config']?.split('/')?.pop()}`,
      projectId: projectId,
      instanceId: spannerInstanceId,
    });
    logger.debug({
      message: `numDatabases:    ${numDatabases}`,
      projectId: projectId,
      instanceId: spannerInstanceId,
    });

    /** @type {SpannerMetadata}     */
    const spannerMetadata = {
      currentSize:
        units === AutoscalerUnits.NODES
          ? assertDefined(metadata['nodeCount'])
          : assertDefined(metadata['processingUnits']),
      regional: !!metadata['config']?.split('/')?.pop()?.startsWith('regional'),
      currentNumDatabases: numDatabases,
      // DEPRECATED
      currentNodes: assertDefined(metadata['nodeCount']),
    };
    return spannerMetadata;
  } finally {
    spanner.close();
  }
}

/**
 * Post a message to PubSub with the spanner instance and metrics.
 *
 * @param {AutoscalerSpanner} spanner
 * @param {SpannerMetricValue[]} metrics
 * @return {Promise<Void>}
 */
async function postPubSubMessage(spanner, metrics) {
  const topic = pubSub.topic(assertDefined(spanner.scalerPubSubTopic));

  spanner.metrics = metrics;
  const messageBuffer = Buffer.from(JSON.stringify(spanner), 'utf8');

  return topic
    .publishMessage({data: messageBuffer})
    .then(() =>
      logger.info({
        message: `----- Published message to topic: ${spanner.scalerPubSubTopic}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
      }),
    )
    .catch((err) => {
      logger.error({
        message: `An error occurred when publishing the message to ${spanner.scalerPubSubTopic}: ${err}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
        err: err,
      });
    });
}

/**
 * Calls the Scaler cloud function by HTTP POST.
 *
 * @param {SpannerConfig} spanner
 * @param {SpannerMetricValue[]} metrics
 * @return {Promise<Void>}
 */
async function callScalerHTTP(spanner, metrics) {
  spanner.scalerURL ||= 'http://scaler';
  const url = new URL('/metrics', spanner.scalerURL);

  spanner.metrics = metrics;

  return axios
    .post(url.toString(), spanner)
    .then((response) => {
      logger.info({
        message: `----- Published message to scaler, response ${response.statusText}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
      });
    })
    .catch((err) => {
      logger.error({
        message: `An error occurred when calling the scaler: ${err}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
        err: err,
      });
    });
}

/**
 * Enrich the paylod by adding information from the config.
 *
 * @param {string} payload
 * @return {Promise<AutoscalerSpanner[]>} enriched payload
 */
async function parseAndEnrichPayload(payload) {
  const spanners = await parseAndValidateConfig(payload);
  /** @type {AutoscalerSpanner[]} */
  const spannersFound = [];

  for (let sIdx = 0; sIdx < spanners.length; sIdx++) {
    const metricOverrides =
      /** @type {SpannerMetric[]} */
      (spanners[sIdx].metrics);

    // assemble the config
    // merge in the defaults
    spanners[sIdx] = {...baseDefaults, ...spanners[sIdx]};

    spanners[sIdx].units = spanners[sIdx].units?.toUpperCase();
    // handle processing units/nodes defaults
    if (spanners[sIdx].units == 'PROCESSING_UNITS') {
      // merge in the processing units defaults
      spanners[sIdx] = {...processingUnitsDefaults, ...spanners[sIdx]};
    } else if (spanners[sIdx].units == 'NODES') {
      // merge in the nodes defaults
      spanners[sIdx] = {...nodesDefaults, ...spanners[sIdx]};
    } else {
      throw new Error(
        `INVALID CONFIG: ${spanners[sIdx].units} is invalid. Valid values are NODES or PROCESSING_UNITS`,
      );
    }

    // assemble the metrics
    spanners[sIdx].metrics = buildMetrics(
      spanners[sIdx].projectId,
      spanners[sIdx].instanceId,
    );
    // merge in custom thresholds
    if (metricOverrides != null) {
      for (let oIdx = 0; oIdx < metricOverrides.length; oIdx++) {
        const mIdx = spanners[sIdx].metrics.findIndex(
          (x) => x.name === metricOverrides[oIdx].name,
        );
        if (mIdx != -1) {
          spanners[sIdx].metrics[mIdx] = {
            ...spanners[sIdx].metrics[mIdx],
            ...metricOverrides[oIdx],
          };
        } else {
          /** @type {SpannerMetric} */
          const metric = {...metricDefaults, ...metricOverrides[oIdx]};
          if (
            validateCustomMetric(
              metric,
              spanners[sIdx].projectId,
              spanners[sIdx].instanceId,
            )
          ) {
            metric.filter =
              createBaseFilter(
                spanners[sIdx].projectId,
                spanners[sIdx].instanceId,
              ) + metric.filter;
            spanners[sIdx].metrics.push(metric);
          }
        }
      }
    }

    // merge in the current Spanner state
    try {
      spanners[sIdx] = {
        ...spanners[sIdx],
        ...(await getSpannerMetadata(
          spanners[sIdx].projectId,
          spanners[sIdx].instanceId,
          spanners[sIdx].units.toUpperCase(),
        )),
      };
      spannersFound.push(spanners[sIdx]);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve Spanner metadata for ${spanners[sIdx].projectId}/${spanners[sIdx].instanceId}: ${err}`,
        projectId: spanners[sIdx].projectId,
        instanceId: spanners[sIdx].instanceId,
        err: err,
        payload: spanners[sIdx],
      });
    }
  }

  return spannersFound;
}

/**
 * Retrive the metrics for a spanner instance
 *
 * @param {AutoscalerSpanner} spanner
 * @return {Promise<SpannerMetricValue[]>} metric values
 */
async function getMetrics(spanner) {
  logger.info({
    message: `----- ${spanner.projectId}/${spanner.instanceId}: Getting Metrics -----`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
  });
  /** @type {SpannerMetricValue[]} */
  const metrics = [];
  for (const m of spanner.metrics) {
    const metric = /** @type {SpannerMetric} */ (m);
    const [maxMetricValue, maxLocation] = await getMaxMetricValue(
      spanner.projectId,
      spanner.instanceId,
      metric,
    );

    let threshold;
    let margin;
    if (spanner.regional) {
      threshold = metric.regional_threshold;
      if (!metric.hasOwnProperty('regional_margin')) {
        metric.regional_margin = DEFAULT_THRESHOLD_MARGIN;
      }
      margin = metric.regional_margin;
    } else {
      threshold = metric.multi_regional_threshold;
      if (!metric.hasOwnProperty('multi_regional_margin')) {
        metric.multi_regional_margin = DEFAULT_THRESHOLD_MARGIN;
      }
      margin = metric.multi_regional_margin;
    }

    logger.debug({
      message: `  ${metric.name} = ${maxMetricValue}, threshold = ${threshold}, margin = ${margin}, location = ${maxLocation}`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });

    /** @type {SpannerMetricValue} */
    const metricsObject = {
      name: metric.name,
      threshold: threshold,
      margin: assertDefined(margin),
      value: maxMetricValue,
    };
    metrics.push(metricsObject);
  }
  return metrics;
}

/**
 * Forwards the metrics
 * @param {function(
 *    AutoscalerSpanner,
 *    SpannerMetricValue[]): Promise<Void>} forwarderFunction
 * @param {AutoscalerSpanner[]} spanners config objects
 * @return {Promise<Void>}
 */
async function forwardMetrics(forwarderFunction, spanners) {
  for (const spanner of spanners) {
    try {
      const metrics = await getMetrics(spanner);
      await forwarderFunction(spanner, metrics); // Handles exceptions
      await Counters.incPollingSuccessCounter(spanner);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metrics for ${spanner.projectId}/${spanner.instanceId}: ${err}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
        err: err,
      });
      await Counters.incPollingFailedCounter(spanner);
    }
  }
}

/**
 * Aggregate metrics for a List of spanner config
 *
 * @param {AutoscalerSpanner[]} spanners
 * @return {Promise<AutoscalerSpanner[]>} aggregatedMetrics
 */
async function aggregateMetrics(spanners) {
  const aggregatedMetrics = [];
  for (const spanner of spanners) {
    try {
      spanner.metrics = await getMetrics(spanner);
      aggregatedMetrics.push(spanner);
      await Counters.incPollingSuccessCounter(spanner);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metrics for ${spanner.projectId}/${spanner.instanceId}: ${err}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        spanner: spanner,
        err: err,
      });
      await Counters.incPollingFailedCounter(spanner);
    }
  }
  return aggregatedMetrics;
}

/**
 * Handle a PubSub message and check if scaling is required
 *
 * @param {{data: string}} pubSubEvent
 * @param {*} context
 */
async function checkSpannerScaleMetricsPubSub(pubSubEvent, context) {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    try {
      const spanners = await parseAndEnrichPayload(payload);
      logger.debug({
        message: 'Autoscaler poller started (PubSub).',
        payload: spanners,
      });
      await forwardMetrics(postPubSubMessage, spanners);
      await Counters.incRequestsSuccessCounter();
    } catch (err) {
      logger.error({
        message: `An error occurred in the Autoscaler poller function (PubSub): ${err}`,
        payload: payload,
        err: err,
      });
      await Counters.incRequestsFailedCounter();
    }
  } catch (err) {
    logger.error({
      message: `An error occurred parsing pubsub payload: ${err}`,
      payload: pubSubEvent.data,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * For testing with: https://cloud.google.com/functions/docs/functions-framework
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function checkSpannerScaleMetricsHTTP(req, res) {
  const payload =
    '[{ ' +
    '  "projectId": "spanner-scaler", ' +
    '  "instanceId": "autoscale-test", ' +
    '  "scalerPubSubTopic": ' +
    '     "projects/spanner-scaler/topics/test-scaling", ' +
    '  "minNodes": 1, ' +
    '  "maxNodes": 3, ' +
    '  "stateProjectId" : "spanner-scaler"' +
    '}]';
  try {
    const spanners = await parseAndEnrichPayload(payload);
    await forwardMetrics(postPubSubMessage, spanners);
    res.status(200).end();
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler poller function (HTTP): ${err}`,
      payload: payload,
      err: err,
    });
    res.status(500).contentType('text/plain').end('An Exception occurred');
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * HTTP test
 *
 * @param {string} payload
 */
async function checkSpannerScaleMetricsJSON(payload) {
  try {
    const spanners = await parseAndEnrichPayload(payload);
    logger.debug({
      message: 'Autoscaler poller started (JSON/HTTP).',
      payload: spanners,
    });
    await forwardMetrics(callScalerHTTP, spanners);
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler poller function (JSON/HTTP): ${err}`,
      payload: payload,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * Entrypoint for Local config.
 *
 * @param {string} payload
 * @return {Promise<AutoscalerSpanner[]>}
 */
async function checkSpannerScaleMetricsLocal(payload) {
  try {
    const spanners = await parseAndEnrichPayload(payload);
    logger.debug({
      message: 'Autoscaler poller started (JSON/local).',
      payload: spanners,
    });
    const metrics = await aggregateMetrics(spanners);
    await Counters.incRequestsSuccessCounter();
    return metrics;
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler poller function (JSON/Local): ${err}`,
      payload: payload,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
    return [];
  } finally {
    await Counters.tryFlush();
  }
}

module.exports = {
  checkSpannerScaleMetricsPubSub,
  checkSpannerScaleMetricsHTTP,
  checkSpannerScaleMetricsJSON,
  checkSpannerScaleMetricsLocal,
};
