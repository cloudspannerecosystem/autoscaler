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

const axios = require('axios');
const monitoring = require('@google-cloud/monitoring');
const {PubSub} = require('@google-cloud/pubsub');
const {Spanner} = require('@google-cloud/spanner');
const {logger} = require('../../autoscaler-common/logger');

// GCP service clients
const metricsClient = new monitoring.MetricServiceClient();
const pubSub = new PubSub();
const baseDefaults = {
  units: 'NODES',
  scaleOutCoolingMinutes: 5,
  scaleInCoolingMinutes: 30,
  scalingMethod: 'STEPWISE',
};
const nodesDefaults = {
  units: 'NODES',
  minSize: 1,
  maxSize: 3,
  stepSize: 2,
  overloadStepSize: 5,
};
const processingUnitsDefaults = {
  units: 'PROCESSING_UNITS',
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
 * @return {*} metrics to request
 */
function buildMetrics(projectId, instanceId) {
  // Recommended alerting policies
  // https://cloud.google.com/spanner/docs/monitoring-stackdriver#create-alert
  const metrics = [
    {
      name: 'high_priority_cpu',
      filter: createBaseFilter(projectId, instanceId) +
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
      filter: createBaseFilter(projectId, instanceId) +
          'metric.type='+
          '"spanner.googleapis.com/instance/cpu/smoothed_utilization"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 90,
      multi_regional_threshold: 90,
    },
    {
      name: 'storage',
      filter: createBaseFilter(projectId, instanceId) +
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
  return 'resource.labels.instance_id="' + instanceId + '" AND ' +
      'resource.type="spanner_instance" AND ' +
      'project="' + projectId + '" AND ';
}

/**
 * Checks to make sure required fields are present and populated
 *
 * @param {!Object} metric
 * @param {string} projectId
 * @param {string} instanceId
 * @return {boolean}
 */
function validateCustomMetric(metric, projectId, instanceId) {
  if (!metric.name) {
    logger.info({
      message: 'Missing name parameter for custom metric.',
      projectId: projectId, instanceId: instanceId});
    return false;
  }

  if (!metric.filter) {
    logger.info({
      message: 'Missing filter parameter for custom metric.',
      projectId: projectId, instanceId: instanceId});
    return false;
  }

  if (!(metric.regional_threshold > 0 || metric.multi_regional_threshold > 0)) {
    logger.info({
      message: 'Missing regional_threshold or multi_multi_regional_threshold ' +
            'parameter for custom metric.',
      projectId: projectId, instanceId: instanceId});
    return false;
  }

  return true;
}

/**
 * Get max value of metric over a window
 *
 * @param {string} projectId
 * @param {string} spannerInstanceId
 * @param {Object} metric
 * @return {Promise}
 */
function getMaxMetricValue(projectId, spannerInstanceId, metric) {
  const metricWindow = 5;
  logger.debug({
    message: `Get max ${metric.name} from ${projectId}/${
      spannerInstanceId} over ${metricWindow} minutes.`,
    projectId: projectId, instanceId: spannerInstanceId});

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
      crossSeriesReducer: metric.reducer,
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
      for (const point of resource.points) {
        value = parseFloat(point.value.doubleValue) * 100;
        if (value > maxValue) {
          maxValue = value;
          if (resource.resource.labels.location) {
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
 * @param {string} units NODES or PU
 * @return {Promise}
 */
function getSpannerMetadata(projectId, spannerInstanceId, units) {
  logger.info({
    message: `----- ${projectId}/${spannerInstanceId}: Getting Metadata -----`,
    projectId: projectId, instanceId: spannerInstanceId});

  const spanner = new Spanner({
    projectId: projectId,
    userAgent: 'cloud-solutions/spanner-autoscaler-poller-usage-v1.0',
  });
  const spannerInstance = spanner.instance(spannerInstanceId);

  return spannerInstance.getMetadata().then((data) => {
    const metadata = data[0];
    logger.debug({
      message: `DisplayName:     ${metadata['displayName']}`,
      projectId: projectId, instanceId: spannerInstanceId});
    logger.debug({
      message: `NodeCount:       ${metadata['nodeCount']}`,
      projectId: projectId, instanceId: spannerInstanceId});
    logger.debug({
      message: `ProcessingUnits: ${metadata['processingUnits']}`,
      projectId: projectId, instanceId: spannerInstanceId});
    logger.debug({
      message: `Config:          ${metadata['config'].split('/').pop()}`,
      projectId: projectId, instanceId: spannerInstanceId});

    const spannerMetadata = {
      currentSize: (units == 'NODES') ? metadata['nodeCount'] :
                                        metadata['processingUnits'],
      regional: metadata['config'].split('/').pop().startsWith('regional'),
      // DEPRECATED
      currentNodes: metadata['nodeCount'],
    };

    spanner.close();
    return spannerMetadata;
  });
}

/**
 * Post a message to PubSub with the spanner instance and metrics.
 *
 * @param {Object} spanner
 * @param {Object} metrics
 * @return {Promise}
 */
async function postPubSubMessage(spanner, metrics) {
  const topic = pubSub.topic(spanner.scalerPubSubTopic);

  spanner.metrics = metrics;
  const messageBuffer = Buffer.from(JSON.stringify(spanner), 'utf8');

  return topic.publish(messageBuffer)
      .then(logger.info({
        message:
          `----- Published message to topic: ${spanner.scalerPubSubTopic}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
      }))
      .catch((err) => {
        logger.error({
          message: `An error occurred when publishing the message to ${
            spanner.scalerPubSubTopic}`,
          projectId: spanner.projectId,
          instanceId: spanner.instanceId,
          payload: err,
          err: err,
        });
      });
}

/**
 * Calls the Scaler cloud function by HTTP POST.
 *
 * @param {Object} spanner
 * @param {Object} metrics
 * @return {Promise}
 */
async function callScalerHTTP(spanner, metrics) {
  spanner.scalerURL ||= 'http://scaler';
  const url = new URL('/metrics', spanner.scalerURL);

  spanner.metrics = metrics;

  return axios.post(url.toString(), spanner)
      .then(
          (response) => {
            logger.info({
              message: `----- Published message to scaler, response ${
                response.statusText}`,
              projectId: spanner.projectId,
              instanceId: spanner.instanceId,
              payload: spanner,
            });
          })
      .catch((err) => {
        logger.error({
          message: `An error occurred when calling the scaler`,
          projectId: spanner.projectId,
          instanceId: spanner.instanceId,
          payload: err,
          err: err,
        });
      });
}

/**
 * Enrich the paylod by adding information from the config.
 *
 * @param {string} payload
 * @return {Object} enriched payload
 */
async function parseAndEnrichPayload(payload) {
  const spanners = JSON.parse(payload);
  const spannersFound = [];

  for (let sIdx = 0; sIdx < spanners.length; sIdx++) {
    const metricOverrides = spanners[sIdx].metrics;

    // assemble the config
    // merge in the defaults
    spanners[sIdx] = {...baseDefaults, ...spanners[sIdx]};

    // handle processing units and deprecation of minNodes/maxNodes
    if (spanners[sIdx].units.toUpperCase() == 'PROCESSING_UNITS') {
      spanners[sIdx].units = spanners[sIdx].units.toUpperCase();
      // merge in the processing units defaults
      spanners[sIdx] = {...processingUnitsDefaults, ...spanners[sIdx]};

      // minNodes and maxNodes should not be used with processing units. If
      // they are set the config is invalid.
      if (spanners[sIdx].minNodes || spanners[sIdx].maxNodes) {
        throw new Error(
            'INVALID CONFIG: units is set to PROCESSING_UNITS, ' +
            'however, minNodes or maxNodes is set, ' +
            'remove minNodes and maxNodes from your configuration.');
      }
    } else if (spanners[sIdx].units.toUpperCase() == 'NODES') {
      spanners[sIdx].units = spanners[sIdx].units.toUpperCase();

      // if minNodes or minSize are provided set the other, and if both are set
      // and not match throw an error
      if (spanners[sIdx].minNodes && !spanners[sIdx].minSize) {
        logger.warn({
          message: `DEPRECATION: minNodes is deprecated, ' +
            'remove minNodes from your config and instead use: ' +
            'units = 'NODES' and minSize = ${spanners[sIdx].minNodes}`,
          projectId: spanners[sIdx].projectId,
          instanceId: spanners[sIdx].instanceId,
        });
        spanners[sIdx].minSize = spanners[sIdx].minNodes;
      } else if (
        spanners[sIdx].minSize && spanners[sIdx].minNodes &&
          spanners[sIdx].minSize != spanners[sIdx].minNodes) {
        throw new Error(
            'INVALID CONFIG: minSize and minNodes are both set ' +
            'but do not match, make them match or only set minSize');
      }

      // if maxNodes or maxSize are provided set the other, and if both are set
      // and not match throw an error
      if (spanners[sIdx].maxNodes && !spanners[sIdx].maxSize) {
        logger.warn({
          message: `DEPRECATION: maxNodes is deprecated, remove maxSize ' +
            'from your config and instead use: ' +
            'units = 'NODES' and maxSize = ${spanners[sIdx].maxNodes}`,
          projectId: spanners[sIdx].projectId,
          instanceId: spanners[sIdx].instanceId,
        });
        spanners[sIdx].maxSize = spanners[sIdx].maxNodes;
      } else if (
        spanners[sIdx].maxSize && spanners[sIdx].maxNodes &&
          spanners[sIdx].maxSize != spanners[sIdx].maxNodes) {
        throw new Error(
            'INVALID CONFIG: maxSize and maxNodes are both set ' +
            'but do not match, make them match or only set maxSize');
      }

      // at this point both minNodes/minSize and maxNodes/maxSize are matching
      // or are both not set so we can merge in defaults
      spanners[sIdx] = {...nodesDefaults, ...spanners[sIdx]};
    } else {
      throw new Error(`INVALID CONFIG: ${
        spanners[sIdx]
            .units} is invalid. Valid values are NODES or PROCESSING_UNITS`);
    }

    // assemble the metrics
    spanners[sIdx].metrics =
        buildMetrics(spanners[sIdx].projectId, spanners[sIdx].instanceId);
    // merge in custom thresholds
    if (metricOverrides != null) {
      for (let oIdx = 0; oIdx < metricOverrides.length; oIdx++) {
        mIdx = spanners[sIdx].metrics.findIndex(
            (x) => x.name === metricOverrides[oIdx].name);
        if (mIdx != -1) {
          spanners[sIdx].metrics[mIdx] = {
            ...spanners[sIdx].metrics[mIdx],
            ...metricOverrides[oIdx],
          };
        } else {
          const metric = {...metricDefaults, ...metricOverrides[oIdx]};
          if (validateCustomMetric(
              metric, spanners[sIdx].projectId,
              spanners[sIdx].instanceId)) {
            metric.filter =
                createBaseFilter(
                    spanners[sIdx].projectId, spanners[sIdx].instanceId) +
                metric.filter;
            spanners[sIdx].metrics.push(metric);
          }
        }
      }
    }

    // merge in the current Spanner state
    try {
      spanners[sIdx] = {
        ...spanners[sIdx],
        ...await getSpannerMetadata(
            spanners[sIdx].projectId, spanners[sIdx].instanceId,
            spanners[sIdx].units.toUpperCase()),
      };
      spannersFound.push(spanners[sIdx]);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve Spanner metadata for ${
          spanners[sIdx].projectId}/${spanners[sIdx].instanceId}`,
        projectId: spanners[sIdx].projectId,
        instanceId: spanners[sIdx].instanceId,
        payload: err,
      });
    }
  }

  return spannersFound;
}

/**
 * Retrive the metrics for a spanner instance
 *
 * @param {Object} spanner
 * @return {Promise<Object>} metrics
 */
async function getMetrics(spanner) {
  logger.info({
    message:
      `----- ${spanner.projectId}/${spanner.instanceId}: Getting Metrics -----`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
  });
  const metrics = [];
  for (const metric of spanner.metrics) {
    const [maxMetricValue, maxLocation] =
        await getMaxMetricValue(spanner.projectId, spanner.instanceId, metric);

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
      message: `  ${metric.name} = ${maxMetricValue}, threshold = ${
        threshold}, margin = ${margin}, location = ${maxLocation}`,
      projectId: spanner.projectId, instanceId: spanner.instanceId});

    const metricsObject = {
      name: metric.name,
      threshold: threshold,
      margin: margin,
      value: maxMetricValue,
    };
    metrics.push(metricsObject);
  }
  return metrics;
}

/**
 * Forwards the metrics
 * @param {Function} forwarderFunction
 * @param {List} spanners config objects
 * @return {Promise}
 */
forwardMetrics = async (forwarderFunction, spanners) => {
  for (const spanner of spanners) {
    try {
      const metrics = await getMetrics(spanner);
      await forwarderFunction(spanner, metrics); // Handles exceptions
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metrics for ${spanner.projectId}/${
          spanner.instanceId}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        err: err,
      });
    }
  }
};

/**
 * Aggregate metrics for a List of spanner config
 *
 * @param {List} spanners
 * @return {Promise} aggregatedMetrics
 */
aggregateMetrics = async (spanners) => {
  const aggregatedMetrics = [];
  for (const spanner of spanners) {
    try {
      spanner.metrics = await getMetrics(spanner);
      aggregatedMetrics.push(spanner);
    } catch (err) {
      logger.error({
        message: `Unable to retrieve metrics for ${spanner.projectId}/${
          spanner.instanceId}`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        err: err,
      });
    }
  }
  return aggregatedMetrics;
};


/**
 * Handle a PubSub message and check if scaling is required
 *
 * @param {Object} pubSubEvent
 * @param {*} context
 */
exports.checkSpannerScaleMetricsPubSub = async (pubSubEvent, context) => {
  let payload;
  try {
    payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    const spanners = await parseAndEnrichPayload(payload);
    logger.debug({
      message: 'Autoscaler poller started (PubSub).',
      payload: spanners});
    await forwardMetrics(postPubSubMessage, spanners);
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler poller function (PubSub)`,
      err: err});
    logger.error({message: `JSON payload`, payload: payload});
  }
};

/**
 * For testing with: https://cloud.google.com/functions/docs/functions-framework
 * @param {Request} req
 * @param {Response} res
 */
exports.checkSpannerScaleMetricsHTTP = async (req, res) => {
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
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler poller function (HTTP)`,
      err: err});
    logger.error({message: `JSON payload`, payload: payload});
    res.status(500).end(err.toString());
  }
};

/**
 * HTTP test
 *
 * @param {string} payload
 */
exports.checkSpannerScaleMetricsJSON = async (payload) => {
  try {
    const spanners = await parseAndEnrichPayload(payload);
    logger.debug({
      message: 'Autoscaler poller started (JSON/HTTP).',
      payload: spanners});
    await forwardMetrics(callScalerHTTP, spanners);
  } catch (err) {
    logger.error({
      message:
        `An error occurred in the Autoscaler poller function (JSON/HTTP)`,
      err: err});
    logger.error({message: `JSON payload`, payload: payload});
  }
};

/**
 * Local test
 *
 * @param {string} payload
 * @return {metrics}
 */
exports.checkSpannerScaleMetricsLocal = async (payload) => {
  try {
    const spanners = await parseAndEnrichPayload(payload);
    logger.debug({
      message: 'Autoscaler poller started (JSON/local).',
      payload: spanners});
    return await aggregateMetrics(spanners);
  } catch (err) {
    logger.error({
      message:
        `An error occurred in the Autoscaler poller function (JSON/Local)`,
      err: err});
    logger.error({message: `JSON payload`, payload: payload});
  }
};
