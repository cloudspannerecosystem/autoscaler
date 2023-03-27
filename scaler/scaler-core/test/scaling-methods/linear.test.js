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

const app = rewire('../../scaling-methods/linear.js');

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
describe('#linear.calculateSize', () => {
  it('should return current size if the metric is within range', () => {
    const spanner = createSpannerParameters({currentSize : 700}, true);
    const callbackStub = stubBaseModule(spanner, {}, true);

    calculateSize(spanner).should.equal(700);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return higher value of processing units if the metric is above range', () => {
    const spanner = createSpannerParameters({currentSize : 700}, true);
    const callbackStub = stubBaseModule(spanner, {value : 75, threshold : 65}, false);

    calculateSize(spanner).should.equal(900);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return higher value of nodes if the metric above range', () => {
    const spanner = createSpannerParameters({units : 'NODES', currentSize: 7}, true);
    const callbackStub = stubBaseModule(spanner, {value : 75, threshold : 65}, false);

    calculateSize(spanner).should.equal(9);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return lower value of processing units if the metric is below range', () => {
    const spanner = createSpannerParameters({currentSize : 700}, true);
    const callbackStub = stubBaseModule(spanner, {value : 55, threshold : 65}, false);

    calculateSize(spanner).should.equal(600);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should return the number of processing units rounded to next 1000 if over 1000', () => {
    const spanner = createSpannerParameters({currentSize : 900}, true);
    const callbackStub = stubBaseModule(spanner, {value : 85, threshold : 65}, false);

    calculateSize(spanner).should.equal(2000);
    assert.equals(callbackStub.callCount, 1);
  });
  
  it('should return the higher instance size if a scaleInLimit is specified', () => {
    const spanner = createSpannerParameters({units : 'NODES', currentSize: 20, scaleInLimit: 10}, true);
    const callbackStub = stubBaseModule(spanner, {value : 30, threshold : 65}, false);

    calculateSize(spanner).should.equal(18);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should not scale in if the scaleInLimit would allow for scaling less than one node', () => {
    const spanner = createSpannerParameters({units : 'NODES', currentSize: 10, scaleInLimit: 5}, true);
    const callbackStub = stubBaseModule(spanner, {value : 40, threshold : 65}, false);

    calculateSize(spanner).should.equal(10);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should not scale in if the scaleInLimit would allow for scaling less than a valid processing unit step size (100 PU)', () => {
    const spanner = createSpannerParameters({units : 'PROCESSING_UNITS', currentSize: 1000, scaleInLimit: 5}, true);
    const callbackStub = stubBaseModule(spanner, {value : 30, threshold : 65}, false);

    calculateSize(spanner).should.equal(1000);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should produce a valid capacity size when using scaleInLimit with processing units', () => {
    const spanner = createSpannerParameters({units : 'PROCESSING_UNITS', currentSize: 1000, scaleInLimit: 50}, true);
    const callbackStub = stubBaseModule(spanner, {value : 30, threshold : 65}, false);

    calculateSize(spanner).should.equal(500);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should scaleIn even when a scaleInLimit is not specified', () => {
    const spanner = createSpannerParameters({units : 'NODES', currentSize: 20}, true);
    const callbackStub = stubBaseModule(spanner, {value : 30, threshold : 65}, false);

    calculateSize(spanner).should.equal(10);
    assert.equals(callbackStub.callCount, 1);
  });

  it('should ignore scaleInLimit when scaling out', () => {
    const spanner = createSpannerParameters({units : 'NODES', currentSize: 20, scaleInLimit: 10}, true);
    const callbackStub = stubBaseModule(spanner, {value : 80, threshold : 65}, false);

    calculateSize(spanner).should.equal(25);
    assert.equals(callbackStub.callCount, 1);
  });
});