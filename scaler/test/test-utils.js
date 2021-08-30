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
const State = require('../state.js');

const DEFAULT_SPANNER_PARAMS = {
    "units":"PROCESSING_UNITS",
    "minSize":100,
    "maxSize":2000,
    "stepSize":200,
    "overloadStepSize":500,
    "scaleOutCoolingMinutes":5,
    "scaleInCoolingMinutes":30,
    "scalingMethod":"STEPWISE",
    "projectId":"spanner-scaler",
    "instanceId":"autoscale-test",
    "metrics":[
       {
          "name":"high_priority_cpu",
          "threshold":65,
          "value":85,
          "margin":15
       },
       {
          "name":"rolling_24_hr",
          "threshold":90,
          "value":70
       },
       {
          "name":"storage",
          "threshold":75,
          "value":80
       }
    ],
    "currentNodes":0,
    "currentSize":100,
    "regional":true
};

function createSpannerParameters(overrideParams) {
   return {...DEFAULT_SPANNER_PARAMS, ...overrideParams};
}

function createStubState() {
  var stubState = new State(spanner);
  sinon.stub(stubState, "get").resolves(0);
  sinon.stub(stubState, "set").resolves(0);
  sinon.stub(stubState, "now").value(Date.now());
  return stubState;
}

module.exports = {
  createSpannerParameters,
  createStubState
};
