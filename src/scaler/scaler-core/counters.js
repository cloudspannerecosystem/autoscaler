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
];

const pendingInit = CountersBase.createCounters(COUNTERS);

/**
 * Build an attribute object for the counter
 *
 * @private
 * @param {AutoscalerSpanner} spanner config object
 * @param {number} requestedSize
 * @return {Attributes}
 */
function _getCounterAttributes(spanner, requestedSize) {
  return {
    'projectId': spanner.projectId,
    'instanceId': spanner.instanceId,
    'method': spanner.scalingMethod,
    'direction':
        requestedSize > spanner.currentSize ? 'SCALE_UP' :
        requestedSize < spanner.currentSize ? 'SCALE_DOWN' : 'SCALE_SAME',
  };
}


/**
 * Increment scaling success counter
 *
 * @param {AutoscalerSpanner} spanner config object
 * @param {number} requestedSize
 */
async function incScalingSuccessCounter(spanner, requestedSize) {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.SCALING_SUCCESS,
      _getCounterAttributes(spanner, requestedSize));
}

/**
 * Increment scaling failed counter
 *
 * @param {AutoscalerSpanner} spanner config object
 * @param {number} requestedSize
 */
async function incScalingFailedCounter(spanner, requestedSize) {
  await pendingInit;
  CountersBase.incCounter(COUNTER_NAMES.SCALING_FAILED,
      _getCounterAttributes(spanner, requestedSize));
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
    ..._getCounterAttributes(spanner, requestedSize),
    'reason': reason,
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


module.exports = {
  incScalingSuccessCounter,
  incScalingFailedCounter,
  incScalingDeniedCounter,
  incRequestsSuccessCounter,
  incRequestsFailedCounter,
  tryFlush: CountersBase.tryFlush,
};
