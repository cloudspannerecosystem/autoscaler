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

const axios      = require('axios');
const monitoring = require('@google-cloud/monitoring');
const {PubSub}   = require('@google-cloud/pubsub');
const {Spanner}  = require('@google-cloud/spanner');
const {log}      = require('./utils.js');

// GCP service clients
const metricsClient = new monitoring.MetricServiceClient();
const pubSub = new PubSub();
const baseDefaults = {
  units: 'NODES',
  scaleOutCoolingMinutes: 5,
  scaleInCoolingMinutes: 30,
  scalingMethod: 'STEPWISE'
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
  overloadStepSize: 500
};
const metricDefaults = {
  period: 60,
  aligner: 'ALIGN_MAX',
  reducer: 'REDUCE_SUM'
};
const DEFAULT_THRESHOLD_MARGIN = 5;

function buildMetrics(projectId, instanceId) {
  // Recommended alerting policies
  // https://cloud.google.com/spanner/docs/monitoring-stackdriver#create-alert
  const metrics = [
    {
      name: 'high_priority_cpu',
      filter: createBaseFilter(projectId, instanceId) +
          'metric.type="spanner.googleapis.com/instance/cpu/utilization_by_priority" AND ' +
          'metric.label.priority="high"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 65,
      multi_regional_threshold: 45
    },
    {
      name: 'rolling_24_hr',
      filter: createBaseFilter(projectId, instanceId) +
          'metric.type="spanner.googleapis.com/instance/cpu/smoothed_utilization"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 90,
      multi_regional_threshold: 90
    },
    {
      name: 'storage',
      filter: createBaseFilter(projectId, instanceId) +
          'metric.type="spanner.googleapis.com/instance/storage/utilization"',
      reducer: 'REDUCE_SUM',
      aligner: 'ALIGN_MAX',
      period: 60,
      regional_threshold: 75,
      multi_regional_threshold: 75
    }
  ];

  return metrics;
}

// creates the base filter that should be prepended to all metric filters
function createBaseFilter(projectId, instanceId) {
  return 'resource.labels.instance_id="' + instanceId + '" AND ' +
  'resource.type="spanner_instance" AND ' +
  'project="' + projectId + '" AND '
}

// checks to make sure required fields are present and populated
function validateCustomMetric(metric, projectId, instanceId) {
  if(!metric.name) {
    log('Missing name parameter for custom metric.', {severity: 'INFO', projectId: projectId, instanceId: instanceId});
    return false;
  }

  if(!metric.filter) {
    log('Missing filter parameter for custom metric.', {severity: 'INFO', projectId: projectId, instanceId: instanceId});
    return false;
  }

  if(!(metric.regional_threshold > 0 || metric.multi_regional_threshold > 0)) {
    log('Missing regional_threshold or multi_multi_regional_threshold ' +
        'parameter for custom metric.', {severity: 'INFO', projectId: projectId, instanceId: instanceId});
    return false;
  }

  return true;
}

function getMaxMetricValue(projectId, spannerInstanceId, metric) {
  const metricWindow = 5;
  log(`Get max ${metric.name} from ${projectId}/${spannerInstanceId} over ${metricWindow} minutes.`,
    {projectId: projectId, instanceId: spannerInstanceId});

  const request = {
    name: 'projects/' + projectId,
    filter: metric.filter,
    interval: {
      startTime: {
        seconds: Date.now() / 1000 - metric.period * metricWindow,
      },
      endTime: {
        seconds: Date.now() / 1000,
      }
    },
    aggregation: {
      alignmentPeriod: {
        seconds: metric.period,
      },
      crossSeriesReducer: metric.reducer,
      perSeriesAligner: metric.aligner,
      groupByFields: ['resource.location'],
    },
    view: 'FULL'
  };

  return metricsClient.listTimeSeries(request).then(metricResponses => {
    const resources = metricResponses[0];
    var maxValue = 0.0;
    var maxLocation = 'global';

    for (const resource of resources) {
      for (const point of resource.points) {
        value = parseFloat(point.value.doubleValue) * 100;
        if (value > maxValue) {
          maxValue = value;
          if(resource.resource.labels.location) {
            maxLocation = resource.resource.labels.location;
          }
        }
      }
    }

    return [maxValue, maxLocation];
  });
}

function getSpannerMetadata(projectId, spannerInstanceId, units) {
  log(`----- ${projectId}/${spannerInstanceId}: Getting Metadata -----`,
    {severity: 'INFO', projectId: projectId, instanceId: spannerInstanceId});

  const spanner = new Spanner({
    projectId: projectId,
  });
  const spannerInstance = spanner.instance(spannerInstanceId);

  return spannerInstance.getMetadata().then(data => {
    const metadata = data[0];
    log(`DisplayName:     ${metadata['displayName']}`, {projectId: projectId, instanceId: spannerInstanceId});
    log(`NodeCount:       ${metadata['nodeCount']}`, {projectId: projectId, instanceId: spannerInstanceId});
    log(`ProcessingUnits: ${metadata['processingUnits']}`, {projectId: projectId, instanceId: spannerInstanceId});
    log(`Config:          ${metadata['config'].split('/').pop()}`, {projectId: projectId, instanceId: spannerInstanceId});

    const spannerMetadata = {
      currentSize: (units == 'NODES') ? metadata['nodeCount'] : metadata['processingUnits'],
      regional: metadata['config'].split('/').pop().startsWith('regional'),
      // DEPRECATED
      currentNodes: metadata['nodeCount'],
    };

    spanner.close();
    return spannerMetadata;
  });
}

function postPubSubMessage(spanner, metrics) {
  const topic = pubSub.topic(spanner.scalerPubSubTopic);

  spanner.metrics = metrics;
  const messageBuffer = Buffer.from(JSON.stringify(spanner), 'utf8');

  return topic.publish(messageBuffer)
      .then(
          log(`----- Published message to topic: ${spanner.scalerPubSubTopic}`,
            {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner}))
      .catch(err => {
        log(`An error occurred when publishing the message to ${spanner.scalerPubSubTopic}`,
          {severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: err});
      });
}

function callScalerHTTP(spanner, metrics) {
  spanner.metrics = metrics;

  return axios.post('http://scaler/metrics', spanner)
    .then(response => {
      log(`----- Published message to scaler, response ${response.statusText}`,
        {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner})
    })
    .catch(err => {
      log(`An error occurred when calling the scaler`,
        {severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: err});
    });
}

async function parseAndEnrichPayload(payload) {
  var spanners = JSON.parse(payload);
  var spannersFound = [];

  for (var sIdx = 0; sIdx < spanners.length; sIdx++) {
    const metricOverrides = spanners[sIdx].metrics;

    // assemble the config
    // merge in the defaults
    spanners[sIdx] = {...baseDefaults, ...spanners[sIdx]};

    // handle processing units and deprecation of minNodes/maxNodes
    if(spanners[sIdx].units.toUpperCase() == 'PROCESSING_UNITS') {
      spanners[sIdx].units = spanners[sIdx].units.toUpperCase();
      // merge in the processing units defaults
      spanners[sIdx] = {...processingUnitsDefaults, ...spanners[sIdx]};

      // minNodes and maxNodes should not be used with processing units. If
      // they are set the config is invalid.
      if(spanners[sIdx].minNodes || spanners[sIdx].maxNodes ) {
        throw new Error('INVALID CONFIG: units is set to PROCESSING_UNITS, however, minNodes or maxNodes is set, remove minNodes and maxNodes from your configuration.');
      }
    }
    else if(spanners[sIdx].units.toUpperCase() == 'NODES') {
      spanners[sIdx].units = spanners[sIdx].units.toUpperCase();

      // if minNodes or minSize are provided set the other, and if both are set and not match throw an error
      if(spanners[sIdx].minNodes && !spanners[sIdx].minSize) {
        log(`DEPRECATION: minNodes is deprecated, remove minNodes from your config and instead use: units = 'NODES' and minSize = ${spanners[sIdx].minNodes}`,
          {severity: 'WARNING', projectId: spanners[sIdx].projectId, instanceId: spanners[sIdx].instanceId});
        spanners[sIdx].minSize = spanners[sIdx].minNodes;
      } else if(spanners[sIdx].minSize && spanners[sIdx].minNodes && spanners[sIdx].minSize != spanners[sIdx].minNodes) {
        throw new Error('INVALID CONFIG: minSize and minNodes are both set but do not match, make them match or only set minSize');
      }

      // if maxNodes or maxSize are provided set the other, and if both are set and not match throw an error
      if(spanners[sIdx].maxNodes && !spanners[sIdx].maxSize) {
        log(`DEPRECATION: maxNodes is deprecated, remove maxSize from your config and instead use: units = 'NODES' and maxSize = ${spanners[sIdx].maxNodes}`,
          {severity: 'WARNING', projectId: spanners[sIdx].projectId, instanceId: spanners[sIdx].instanceId});
        spanners[sIdx].maxSize = spanners[sIdx].maxNodes;
      } else if(spanners[sIdx].maxSize && spanners[sIdx].maxNodes && spanners[sIdx].maxSize != spanners[sIdx].maxNodes) {
        throw new Error('INVALID CONFIG: maxSize and maxNodes are both set but do not match, make them match or only set maxSize');
      }

      // at this point both minNodes/minSize and maxNodes/maxSize are matching or are both not set so we can merge in defaults
      spanners[sIdx] = {...nodesDefaults, ...spanners[sIdx]};
    }
    else
      throw new Error(`INVALID CONFIG: ${spanners[sIdx].units} is invalid. Valid values are NODES or PROCESSING_UNITS`);

    // assemble the metrics
    spanners[sIdx].metrics =
      buildMetrics(spanners[sIdx].projectId, spanners[sIdx].instanceId);
    // merge in custom thresholds
    if(metricOverrides != null) {
      for (var oIdx = 0; oIdx < metricOverrides.length; oIdx++) {
        mIdx = spanners[sIdx].metrics.findIndex(x => x.name === metricOverrides[oIdx].name);
        if(mIdx != -1) {
          spanners[sIdx].metrics[mIdx] = {...spanners[sIdx].metrics[mIdx], ...metricOverrides[oIdx]};
        }
        else {
          var metric = {...metricDefaults, ...metricOverrides[oIdx]};
          if(validateCustomMetric(metric, spanners[sIdx].projectId, spanners[sIdx].instanceId)) {
            metric.filter = createBaseFilter(spanners[sIdx].projectId, spanners[sIdx].instanceId) + metric.filter;
            spanners[sIdx].metrics.push(metric);
          }
        }
      }
    }

    // merge in the current Spanner state
    try {
      spanners[sIdx] = {
        ...spanners[sIdx],
        ...await getSpannerMetadata(spanners[sIdx].projectId, spanners[sIdx].instanceId, spanners[sIdx].units.toUpperCase())
      };
      spannersFound.push(spanners[sIdx]);
    } catch (err) {
      log(`Unable to retrieve Spanner metadata for ${spanners[sIdx].projectId}/${spanners[sIdx].instanceId}`,
        {severity: 'ERROR', projectId: spanners[sIdx].projectId, instanceId: spanners[sIdx].instanceId, payload: err});
    }
  }

  return spannersFound;
}

async function getMetrics(spanner) {
  log(`----- ${spanner.projectId}/${spanner.instanceId}: Getting Metrics -----`,
    {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId});
  var metrics = [];
  for (const metric of spanner.metrics) {
    var [maxMetricValue, maxLocation] =
        await getMaxMetricValue(spanner.projectId, spanner.instanceId, metric);

    var threshold;
    var margin;
    if (spanner.regional) {
      threshold = metric.regional_threshold;
      if (!metric.hasOwnProperty('regional_margin'))
        metric.regional_margin = DEFAULT_THRESHOLD_MARGIN;
      margin = metric.regional_margin;
    } else {
      threshold = metric.multi_regional_threshold;
      if (!metric.hasOwnProperty('multi_regional_margin'))
        metric.multi_regional_margin = DEFAULT_THRESHOLD_MARGIN;
      margin = metric.multi_regional_margin;
    }

    log(`  ${metric.name} = ${maxMetricValue}, threshold = ${threshold}, margin = ${margin}, location = ${maxLocation}`,
      {projectId: spanner.projectId, instanceId: spanner.instanceId});

    const metricsObject = {
      name: metric.name,
      threshold: threshold,
      margin: margin,
      value: maxMetricValue
    };
    metrics.push(metricsObject);
  }
  return metrics;
}

forwardMetrics = async (forwarderFunction, spanners) => {
  for (const spanner of spanners) {
    try {
      var metrics = await getMetrics(spanner);
      forwarderFunction(spanner, metrics); // Handles exceptions
    } catch (err) {
      log(`Unable to retrieve metrics for ${spanner.projectId}/${spanner.instanceId}`,
        {severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: err});
    }
  }
};

exports.checkSpannerScaleMetricsPubSub = async (pubSubEvent, context) => {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    const spanners = await parseAndEnrichPayload(payload);
    log('Autoscaler poller started (PubSub).', {severity: 'DEBUG', payload: spanners});
    await forwardMetrics(postPubSubMessage, spanners);
  } catch (err) {
    log(`An error occurred in the Autoscaler poller function (PubSub)`, {severity: 'ERROR', payload: err});
    log(`JSON payload`, {severity: 'ERROR', payload: payload });
  }
};

// For testing with: https://cloud.google.com/functions/docs/functions-framework
exports.checkSpannerScaleMetricsHTTP = async (req, res) => {
  try {
    const payload =
        '[{"projectId": "spanner-scaler", "instanceId": "autoscale-test", "scalerPubSubTopic": "projects/spanner-scaler/topics/test-scaling", "minNodes": 1, "maxNodes": 3, "stateProjectId" : "spanner-scaler"}]';
    const spanners = await parseAndEnrichPayload(payload);
    await forwardMetrics(postPubSubMessage, spanners);
    res.status(200).end();
  } catch (err) {
    log(`An error occurred in the Autoscaler poller function (HTTP)`, {severity: 'ERROR', payload: err});
    log(`JSON payload`, {severity: 'ERROR', payload: payload });
    res.status(500).end(err.toString());
  }
};

exports.checkSpannerScaleMetricsJSON = async (payload) => {
  try {
    const spanners = await parseAndEnrichPayload(payload);
    log('Autoscaler poller started (JSON/HTTP).', {severity: 'DEBUG', payload: spanners});
    await forwardMetrics(callScalerHTTP, spanners);
  } catch (err) {
    log(`An error occurred in the Autoscaler poller function (JSON)`, {severity: 'ERROR', payload: err});
    log(`JSON payload`, {severity: 'ERROR', payload: payload });
  }
};

module.exports.log = log;
