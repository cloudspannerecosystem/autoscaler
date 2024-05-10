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

/** @enum {string} */
const RelativeToRange = {
  BELOW: 'BELOW',
  WITHIN: 'WITHIN',
  ABOVE: 'ABOVE',
};

// https://github.com/cloudspannerecosystem/autoscaler/issues/25
// Autoscaling is triggered if the metric value is outside of threshold +-
// margin
const DEFAULT_THRESHOLD_MARGIN = 5;

// Min 10 databases per 100 processing units.
// https://cloud.google.com/spanner/quotas#database-limits
const DATABASES_PER_100_PU = 10;

const {logger} = require('../../../autoscaler-common/logger');
const {AutoscalerUnits} = require('../../../autoscaler-common/types');

/**
 * @typedef {import('../../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 * @typedef {import('../../../autoscaler-common/types').SpannerMetricValue
 * } SpannerMetricValue
 */

/**
 * Get a string describing the scaling suggestion.
 *
 * @param {AutoscalerSpanner} spanner
 * @param {number} suggestedSize
 * @param {string} relativeToRange
 * @return {string}
 */
function getScaleSuggestionMessage(spanner, suggestedSize, relativeToRange) {
  if (relativeToRange == RelativeToRange.WITHIN) {
    return `no change suggested`;
  }
  if (suggestedSize > spanner.maxSize) {
    return `however, cannot scale to ${suggestedSize} because it is higher than MAX ${spanner.maxSize} ${spanner.units}`;
  }
  if (suggestedSize < spanner.minSize) {
    return `however, cannot scale to ${suggestedSize} because it is lower than MIN ${spanner.minSize} ${spanner.units}`;
  }
  if (suggestedSize == spanner.currentSize) {
    return `the suggested size is equal to the current size: ${spanner.currentSize} ${spanner.units}`;
  }
  return `suggesting to scale from ${spanner.currentSize} to ${suggestedSize} ${spanner.units}.`;
}

/**
 * Build a ranger object from given threshold and margin.
 * @param {number} threshold
 * @param {number} margin
 * @return {{min: number,max: number}}
 */
function getRange(threshold, margin) {
  const range = {min: threshold - margin, max: threshold + margin};

  if (range.min < 0) range.min = 0;
  if (range.max > 100) range.max = 100;

  return range;
}

/**
 * Test if given metric is within a range
 * @param {SpannerMetricValue} metric
 * @return {boolean}
 */
function metricValueWithinRange(metric) {
  if (compareMetricValueWithRange(metric) == RelativeToRange.WITHIN) {
    return true;
  } else {
    return false;
  }
}

/**
 * Test to see where a metric fits within its range
 *
 * @param {SpannerMetricValue} metric
 * @return {RelativeToRange} RelativeToRange enum
 */
function compareMetricValueWithRange(metric) {
  const range = getRange(metric.threshold, metric.margin);

  if (metric.value < range.min) return RelativeToRange.BELOW;
  if (metric.value > range.max) return RelativeToRange.ABOVE;
  return RelativeToRange.WITHIN;
}

/**
 * Log the suggested scaling.
 * @param {AutoscalerSpanner} spanner
 * @param {SpannerMetricValue} metric
 * @param {number} suggestedSize
 */
function logSuggestion(spanner, metric, suggestedSize) {
  const metricDetails = `\t${metric.name}=${metric.value}%,`;
  const relativeToRange = compareMetricValueWithRange(metric);

  const range = getRange(metric.threshold, metric.margin);
  const rangeDetails = `${relativeToRange} the range [${range.min}%-${range.max}%]`;

  if (metric.name === OVERLOAD_METRIC && spanner.isOverloaded) {
    logger.debug({
      message: `${metricDetails} ABOVE the ${OVERLOAD_THRESHOLD} overload threshold => ${getScaleSuggestionMessage(
        spanner,
        suggestedSize,
        RelativeToRange.ABOVE,
      )}`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });
  } else {
    logger.debug({
      message: `${metricDetails} ${rangeDetails} => ${getScaleSuggestionMessage(
        spanner,
        suggestedSize,
        relativeToRange,
      )}`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });
  }
}

/**
 * Get the max suggested size for the given spanner instance based
 * on its metrics
 *
 * @param {AutoscalerSpanner} spanner
 * @param {function(AutoscalerSpanner,SpannerMetricValue): number
 * } getSuggestedSize
 * @return {number}
 */
function loopThroughSpannerMetrics(spanner, getSuggestedSize) {
  logger.debug({
    message: `---- ${spanner.projectId}/${spanner.instanceId}: ${spanner.scalingMethod} size suggestions----`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
  });
  logger.debug({
    message: `\tMin=${spanner.minSize}, Current=${spanner.currentSize}, Max=${spanner.maxSize} ${spanner.units}`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
  });

  let maxSuggestedSize = spanner.minSize;

  if (
    spanner.units === AutoscalerUnits.PROCESSING_UNITS &&
    spanner.currentNumDatabases
  ) {
    const minUnitsForNumDatabases =
      Math.ceil(spanner.currentNumDatabases / DATABASES_PER_100_PU) * 100;
    logger.info({
      message: `\tMinumum ${minUnitsForNumDatabases} ${spanner.units} required for ${spanner.currentNumDatabases} databases`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });
    maxSuggestedSize = Math.max(maxSuggestedSize, minUnitsForNumDatabases);
  }

  spanner.isOverloaded = false;

  for (const metric of /** @type {SpannerMetricValue[]} */ (spanner.metrics)) {
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
  logger.debug({
    message: `\t=> Final ${spanner.scalingMethod} suggestion: ${maxSuggestedSize} ${spanner.units}`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
  });
  return maxSuggestedSize;
}

module.exports = {
  OVERLOAD_METRIC,
  OVERLOAD_THRESHOLD,
  loopThroughSpannerMetrics,
  metricValueWithinRange,
};
