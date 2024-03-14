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

const COUNTERS_PREFIX = 'poller/';

const COUNTER_NAMES = {
  POLLING_SUCCESS: COUNTERS_PREFIX + 'polling-success',
  POLLING_FAILED: COUNTERS_PREFIX + 'polling-failed',
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
    counterName: COUNTER_NAMES.POLLING_SUCCESS,
    counterDesc: 'The number of Spanner polling events that succeeded',
  },
  {
    counterName: COUNTER_NAMES.POLLING_FAILED,
    counterDesc: 'The number of Spanner polling events that failed',
  },
  {
    counterName: COUNTER_NAMES.REQUESTS_SUCCESS,
    counterDesc: 'The number of polling request messages handled successfully',
  },
  {
    counterName: COUNTER_NAMES.REQUESTS_FAILED,
    counterDesc: 'The number of polling request messages that failed',
  },
];

const pendingInit = CountersBase.createCounters(COUNTERS);

/**
 * Build an attribute object for the counter
 *
 * @private
 * @param {AutoscalerSpanner} spanner config object
 * @return {Attributes}
 */
function _getCounterAttributes(spanner) {
  return {
    [CountersBase.COUNTER_ATTRIBUTE_NAMES.SPANNER_PROJECT_ID]:
      spanner.projectId,
    [CountersBase.COUNTER_ATTRIBUTE_NAMES.SPANNER_INSTANCE_ID]:
      spanner.instanceId,
  };
}

/**
 * Increment polling success counter
 *
 * @param {AutoscalerSpanner} spanner config object
 */
async function incPollingSuccessCounter(spanner) {
  await pendingInit;
  CountersBase.incCounter(
    COUNTER_NAMES.POLLING_SUCCESS,
    _getCounterAttributes(spanner),
  );
}

/**
 * Increment polling failed counter
 *
 * @param {AutoscalerSpanner} spanner config object
 */
async function incPollingFailedCounter(spanner) {
  await pendingInit;
  CountersBase.incCounter(
    COUNTER_NAMES.POLLING_FAILED,
    _getCounterAttributes(spanner),
  );
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
  incPollingSuccessCounter,
  incPollingFailedCounter,
  incRequestsSuccessCounter,
  incRequestsFailedCounter,
  tryFlush: CountersBase.tryFlush,
};
