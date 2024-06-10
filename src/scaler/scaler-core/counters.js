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
 * Autoscaler Counters package
 *
 * Publishes Counters to Cloud Monitoring
 *
 */
const CountersBase = require('../../autoscaler-common/counters_base.js');

const COUNTERS_PREFIX = 'scaler/';

const COUNTER_NAMES = {
  SCALING_SUCCESS: COUNTERS_PREFIX + 'scaling-success',
  SCALING_DENIED: COUNTERS_PREFIX + 'scaling-denied',
  SCALING_FAILED: COUNTERS_PREFIX + 'scaling-failed',
  REQUESTS_SUCCESS: COUNTERS_PREFIX + 'requests-success',
  REQUESTS_FAILED: COUNTERS_PREFIX + 'requests-failed',
  SCALING_DURATION: COUNTERS_PREFIX + 'scaling-duration',
};

const ATTRIBUTE_NAMES = {
  ...CountersBase.COUNTER_ATTRIBUTE_NAMES,
  SCALING_DENIED_REASON: 'scaling_denied_reason',
  SCALING_METHOD: 'scaling_method',
  SCALING_DIRECTION: 'scaling_direction',
};

/**
 * @typedef {import('../../autoscaler-common/types.js')
 *    .AutoscalerSpanner} AutoscalerSpanner
 */
/**
 * @typedef {import('@opentelemetry/api').Attributes} Attributes
 */

/**
 * @type {import('../../autoscaler-common/counters_base.js')
 *    .CounterDefinition[]}
 */
const COUNTERS = [
  {
    counterName: COUNTER_NAMES.SCALING_SUCCESS,
    counterDesc: 'The number of Spanner scaling events that succeeded',
  },
  {
    counterName: COUNTER_NAMES.SCALING_DENIED,
    counterDesc: 'The number of Spanner scaling events denied',
  },
  {
    counterName: COUNTER_NAMES.SCALING_FAILED,
    counterDesc: 'The number of Spanner scaling events that failed',
  },
  {
    counterName: COUNTER_NAMES.REQUESTS_SUCCESS,
    counterDesc: 'The number of scaling request messages handled successfully',
  },
  {
    counterName: COUNTER_NAMES.REQUESTS_FAILED,
    counterDesc: 'The number of scaling request messages that failed',
  },
  {
    counterName: COUNTER_NAMES.SCALING_DURATION,
    counterDesc: 'The time taken to complete the scaling operation',
    counterType: 'HISTOGRAM',
    counterUnits: 'ms', // milliseconds
    // This creates a set of 25 buckets with exponential growth
    // starting at 0, increasing to 6553_500ms ~= 109mins
    counterHistogramBuckets: [...Array(25).keys()].map((n) =>
      Math.floor(100 * (2 ** (n / 1.5) - 1)),
    ),
  },
];

const pendingInit = CountersBase.createCounters(COUNTERS);

/**
 * Build an attribute object for the counter
 *
 * @private
 * @param {AutoscalerSpanner} spanner config object
 * @param {string?} method
 * @param {number?} previousSize
 * @param {number?} requestedSize
 * @return {Attributes}
 */
function _getCounterAttributes(spanner, method, previousSize, requestedSize) {
  const ret = {
    [ATTRIBUTE_NAMES.SPANNER_PROJECT_ID]: spanner.projectId,
    [ATTRIBUTE_NAMES.SPANNER_INSTANCE_ID]: spanner.instanceId,
  };
  if (method) {
    ret[ATTRIBUTE_NAMES.SCALING_METHOD] = method;
  }
  if (previousSize != null && requestedSize != null) {
    ret[ATTRIBUTE_NAMES.SCALING_DIRECTION] =
      requestedSize > previousSize
        ? 'SCALE_UP'
        : requestedSize < previousSize
          ? 'SCALE_DOWN'
          : 'SCALE_SAME';
  }
  return ret;
}

/**
 * Increment scaling success counter
 *
 * @param {AutoscalerSpanner} spanner config object
 * @param {string?} method
 * @param {number?} previousSize
 * @param {number?} requestedSize
 */
async function incScalingSuccessCounter(
  spanner,
  method,
  previousSize,
  requestedSize,
) {
  await pendingInit;
  CountersBase.incCounter(
    COUNTER_NAMES.SCALING_SUCCESS,
    _getCounterAttributes(spanner, method, previousSize, requestedSize),
  );
}

/**
 * Increment scaling failed counter
 *
 * @param {AutoscalerSpanner} spanner config object
 * @param {string?} method
 * @param {number?} previousSize
 * @param {number?} requestedSize
 */
async function incScalingFailedCounter(
  spanner,
  method,
  previousSize,
  requestedSize,
) {
  await pendingInit;
  CountersBase.incCounter(
    COUNTER_NAMES.SCALING_FAILED,
    _getCounterAttributes(spanner, method, previousSize, requestedSize),
  );
}

/**
 * Increment scaling denied counter
 *
 * @param {AutoscalerSpanner} spanner config object
 * @param {number} requestedSize
 * @param {string} reason
 */
async function incScalingDeniedCounter(spanner, requestedSize, reason) {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.SCALING_DENIED, {
    ..._getCounterAttributes(
      spanner,
      spanner.scalingMethod,
      spanner.currentSize,
      requestedSize,
    ),
    [ATTRIBUTE_NAMES.SCALING_DENIED_REASON]: reason,
  });
}

/**
 * Increment messages success counter
 */
async function incRequestsSuccessCounter() {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.REQUESTS_SUCCESS);
}

/**
 * Increment messages failed counter
 */
async function incRequestsFailedCounter() {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.REQUESTS_FAILED);
}

/**
 * Record scaling duration to the distribution.
 *
 * @param {number} durationMillis
 * @param {AutoscalerSpanner} spanner config object
 * @param {string?} method
 * @param {number?} previousSize
 * @param {number?} requestedSize

 */
async function recordScalingDuration(
  durationMillis,
  spanner,
  method,
  previousSize,
  requestedSize,
) {
  await pendingInit;
  CountersBase.recordValue(
    COUNTER_NAMES.SCALING_DURATION,
    Math.floor(durationMillis),
    _getCounterAttributes(spanner, method, previousSize, requestedSize),
  );
}

module.exports = {
  incScalingSuccessCounter,
  incScalingFailedCounter,
  incScalingDeniedCounter,
  incRequestsSuccessCounter,
  incRequestsFailedCounter,
  recordScalingDuration,
  tryFlush: CountersBase.tryFlush,
};
