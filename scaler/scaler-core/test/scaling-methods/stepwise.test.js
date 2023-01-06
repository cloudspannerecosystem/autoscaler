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

const rewire = require('rewire');
const should = require('should');
const sinon = require('sinon');
const referee = require("@sinonjs/referee");
const assert = referee.assert;
const {createSpannerParameters} = require('../test-utils.js');
const {OVERLOAD_METRIC, OVERLOAD_THRESHOLD} = require('../../scaling-methods/base.js');

const app = rewire('../../scaling-methods/stepwise.js');

afterEach(() => {
  // Restore the default sandbox here
  sinon.restore();
});

function stubBaseModule(spanner, metric, metricValueWithinRange) {
  const callbackStub = sinon.stub().callsArgWith(1, spanner, metric);
  app.__set__("baseModule.loopThroughSpannerMetrics", callbackStub);
  app.__set__("baseModule.metricValueWithinRange", sinon.stub().returns(metricValueWithinRange));
  return callbackStub;
}

const calculateSize = app.__get__('calculateSize');
describe('#stepwise.calculateSize', () => {
  it('should return current size if the metric is within range', () => {
    const spanner = createSpannerParameters({currentSize : 700}, true);
    const callbackStub = stubBaseModule(spanner, {}, true);

    calculateSize(spanner).should.equal(700);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return number of processing units increased by stepSize if the metric is above range', () => {
    const spanner = createSpannerParameters({currentSize : 700, stepSize : 100}, true);
    const callbackStub = stubBaseModule(spanner, {value : 85, threshold : 65}, false);

    calculateSize(spanner).should.equal(800);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return number of processing units decreased by stepSize if the metric is below range', () => {
    const spanner = createSpannerParameters({currentSize : 700, stepSize : 100}, true);
    const callbackStub = stubBaseModule(spanner, {value : 15, threshold : 65}, false);

    calculateSize(spanner).should.equal(600);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return the number of processing units increased by overloadStepSize if the instance is overloaded', () => {
    const spanner = createSpannerParameters(
      {currentSize : 300, stepSize : 100, overloadStepSize : 600, isOverloaded : true}, true);
    const callbackStub = stubBaseModule(spanner, 
      {value : OVERLOAD_THRESHOLD + 1, threshold : 65, name : OVERLOAD_METRIC}, false);

    calculateSize(spanner).should.equal(900);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return the number of processing units rounded to next 1000 if over 1000', () => {
    const spanner = createSpannerParameters({currentSize : 800, stepSize : 400}, true);
    const callbackStub = stubBaseModule(spanner, {value : 85, threshold : 65}, false);

    calculateSize(spanner).should.equal(2000);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return PUs decreased by 1000 when scaling-in, and the size is >1000 PUs, and stepSize is <1000 PUs', () => {
    const spanner = createSpannerParameters({currentSize : 4000, stepSize : 100}, true);
    const callbackStub = stubBaseModule(spanner, {value : 5, threshold : 65}, false);

    calculateSize(spanner).should.equal(3000);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return PUs increased by 1000 when scaling-out, and the size is >1000 PUs, and stepSize is <1000 PUs', () => {
    const spanner = createSpannerParameters({currentSize : 4000, stepSize : 100}, true);
    const callbackStub = stubBaseModule(spanner, {value : 85, threshold : 65}, false);

    calculateSize(spanner).should.equal(5000);
    assert.equals(callbackStub.callCount, 1);
  });

});
