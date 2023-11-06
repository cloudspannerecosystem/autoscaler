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
 * Base module that encapsulates functionality common to scaling methods:
 * * Loop through the Spanner metrics
 * * Determine if the Spanner instance is overloaded
 * * Log sizing suggestions per metric
 */

// Only the high_priority_cpu metric is used to determine if an overload
// situation exists
const OVERLOAD_METRIC = 'high_priority_cpu';
const OVERLOAD_THRESHOLD = 90;

const RelativeToRange = {
  BELOW: 'BELOW',
  WITHIN: 'WITHIN',
  ABOVE: 'ABOVE'
}

// https://github.com/cloudspannerecosystem/autoscaler/issues/25
// Autosclaing is triggered if the metric value is outside of threshold +- margin
const DEFAULT_THRESHOLD_MARGIN = 5;

const {log} = require('../utils.js');

function getScaleSuggestionMessage(spanner, suggestedSize, relativeToRange) {
  if (relativeToRange == RelativeToRange.WITHIN) {
    return `no change suggested`;
  } else if (suggestedSize <= spanner.maxSize && suggestedSize >= spanner.minSize) {
    if (suggestedSize == spanner.currentSize)
      return `the suggested size is equal to the current size: ${spanner.currentSize} ${spanner.units}`;
    else 
      return `suggesting to scale from ${spanner.currentSize} to ${suggestedSize} ${spanner.units}.`;
  } else if (suggestedSize > spanner.maxSize) {
    return `however, cannot scale to ${suggestedSize} because it is higher than MAX ${spanner.maxSize} ${spanner.units}`
  } else if (suggestedSize < spanner.minSize) {
    return `however, cannot scale to ${suggestedSize} because it is lower than MIN ${spanner.minSize} ${spanner.units}`
  }
}

function getRange(threshold, margin) {
  var range = { 
    min: threshold - margin, 
    max: threshold + margin 
  };

  if (range.min < 0) range.min = 0;
  if (range.max > 100) range.max = 100;

  return range;
}

function metricValueWithinRange(metric) {
  if (compareMetricValueWithRange(metric) == RelativeToRange.WITHIN) return true;
  else return false;
}

function compareMetricValueWithRange(metric) {
  var range = getRange(metric.threshold, metric.margin);

  if (metric.value < range.min) return RelativeToRange.BELOW;
  if (metric.value > range.max) return RelativeToRange.ABOVE;
  return RelativeToRange.WITHIN;
}

function logSuggestion(spanner, metric, suggestedSize) {
  const metricDetails = `\t${metric.name}=${metric.value}%,`;
  const relativeToRange = compareMetricValueWithRange(metric);

  const range = getRange(metric.threshold, metric.margin);
  const rangeDetails = `${relativeToRange} the range [${range.min}%-${range.max}%]`;

  if (metric.name === OVERLOAD_METRIC && spanner.isOverloaded) {
    log(`${metricDetails} ABOVE the ${OVERLOAD_THRESHOLD} overload threshold => ${getScaleSuggestionMessage(spanner, suggestedSize, RelativeToRange.ABOVE)}`,
      {projectId: spanner.projectId, instanceId: spanner.instanceId});
  } else  {
    log(`${metricDetails} ${rangeDetails} => ${getScaleSuggestionMessage(spanner, suggestedSize, relativeToRange)}`,
      {projectId: spanner.projectId, instanceId: spanner.instanceId});
  } 

}

function loopThroughSpannerMetrics(spanner, getSuggestedSize) {
  log(`---- ${spanner.projectId}/${spanner.instanceId}: ${spanner.scalingMethod} size suggestions----`,
    {projectId: spanner.projectId, instanceId: spanner.instanceId});
  log(`	Min=${spanner.minSize}, Current=${spanner.currentSize}, Max=${spanner.maxSize} ${spanner.units}`,
    {projectId: spanner.projectId, instanceId: spanner.instanceId});

  var maxSuggestedSize = spanner.minSize;
  spanner.isOverloaded = false;

  for (const metric of spanner.metrics) {
    if (metric.name === OVERLOAD_METRIC && metric.value > OVERLOAD_THRESHOLD) {
      spanner.isOverloaded = true;
    }

    if (!metric.hasOwnProperty('margin')) {
      metric.margin = DEFAULT_THRESHOLD_MARGIN;
    }

    const suggestedSize = getSuggestedSize(spanner, metric);
    logSuggestion(spanner, metric, suggestedSize);

    maxSuggestedSize = Math.max(maxSuggestedSize, suggestedSize);
  }

  maxSuggestedSize = Math.min(maxSuggestedSize, spanner.maxSize);
  log(`\t=> Final ${spanner.scalingMethod} suggestion: ${maxSuggestedSize} ${spanner.units}`,
    {projectId: spanner.projectId, instanceId: spanner.instanceId});
  return maxSuggestedSize;
}

module.exports = {
  OVERLOAD_METRIC,
  OVERLOAD_THRESHOLD,
  loopThroughSpannerMetrics,
  metricValueWithinRange
};
