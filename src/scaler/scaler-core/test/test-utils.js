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
const sinon = require('sinon');
const fs = require('fs');
const State = require('../state.js');

/**
 * @typedef {import('../../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 * @typedef {import('../state.js').StateData} StateData
 */

const DUMMY_TIMESTAMP = 1704110400000;

/**
 * Read Spanner params from file
 *
 * @param {Object} [overrideParams]
 * @return {AutoscalerSpanner}
 */
function createSpannerParameters(overrideParams) {
  return {
    ...JSON.parse(
      fs
        .readFileSync('src/scaler/scaler-core/test/samples/parameters.json')
        .toString(),
    ),
    ...overrideParams,
  };
}

/**
 * @return {sinon.SinonStubbedInstance<State>} state class stub
 */
function createStubState() {
  const stubState = sinon.createStubInstance(State);
  stubState.updateState.resolves();
  sinon.replaceGetter(stubState, 'now', () => DUMMY_TIMESTAMP);
  return stubState;
}

/**
 * @return {StateData} StateData object
 */
function createStateData() {
  return {
    lastScalingTimestamp: 0,
    createdOn: 0,
    updatedOn: 0,
    lastScalingCompleteTimestamp: 0,
    scalingOperationId: null,
    scalingMethod: null,
    scalingPreviousSize: null,
    scalingRequestedSize: null,
  };
}

/**
 * @return {string} downstream message
 */
function createDownstreamMsg() {
  return JSON.parse(
    fs
      .readFileSync('src/scaler/scaler-core/test/samples/downstream-msg.json')
      .toString(),
  );
}

module.exports = {
  createSpannerParameters,
  createStubState,
  createStateData,
  createDownstreamMsg,
};
