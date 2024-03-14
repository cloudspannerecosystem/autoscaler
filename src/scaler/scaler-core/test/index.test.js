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
// eslint-disable-next-line no-unused-vars
const should = require('should');
const sinon = require('sinon');
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;
// @ts-ignore
// eslint-disable-next-line no-unused-vars
const refute = referee.refute;
const {createSpannerParameters, createStubState} = require('./test-utils.js');

const app = rewire('../index.js');

afterEach(() => {
  // Restore the default sandbox here
  sinon.restore();
});

const getNewMetadata = app.__get__('getNewMetadata');
describe('#getNewMetadata', () => {
  it('should return an object with the nodeCount property set', () => {
    getNewMetadata(99, 'NODES')
      .should.have.property('nodeCount')
      .which.is.a.Number()
      .and.equal(99);
  });

  it('should return an object with the processingUnits property set', () => {
    getNewMetadata(88, 'PROCESSING_UNITS')
      .should.have.property('processingUnits')
      .which.is.a.Number()
      .and.equal(88);
  });
});

const processScalingRequest = app.__get__('processScalingRequest');
const countersStub = {
  incScalingSuccessCounter: sinon.stub(),
  incScalingFailedCounter: sinon.stub(),
  incScalingDeniedCounter: sinon.stub(),
};
const stubScaleSpannerInstance = sinon.stub();
const getSuggestedSizeStub = sinon.stub();
const withinCooldownPeriod = sinon.stub();

describe('#processScalingRequest', () => {
  beforeEach(() => {
    // Setup common stubs
    stubScaleSpannerInstance.resolves();
    app.__set__('scaleSpannerInstance', stubScaleSpannerInstance);
    app.__set__('Counters', countersStub);
    app.__set__('withinCooldownPeriod', withinCooldownPeriod.returns(false));
    app.__set__('getSuggestedSize', getSuggestedSizeStub);
  });

  afterEach(() => {
    // reset stubs
    Object.values(countersStub).forEach((stub) => stub.reset());
    stubScaleSpannerInstance.reset();
    getSuggestedSizeStub.reset();
    withinCooldownPeriod.reset();
  });

  it('should not autoscale if suggested size is equal to current size', async function () {
    const spanner = createSpannerParameters();
    getSuggestedSizeStub.returns(spanner.currentSize);

    await processScalingRequest(spanner, createStubState());

    assert.equals(stubScaleSpannerInstance.callCount, 0);

    assert.equals(countersStub.incScalingSuccessCounter.callCount, 0);
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[1],
      spanner.currentSize,
    );
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[2],
      'CURRENT_SIZE',
    );
    assert.equals(countersStub.incScalingFailedCounter.callCount, 0);
  });

  it('should not autoscale if suggested size is equal to max size', async function () {
    const spanner = createSpannerParameters();
    spanner.currentSize = spanner.maxSize;
    getSuggestedSizeStub.returns(spanner.maxSize);

    await processScalingRequest(spanner, createStubState());

    assert.equals(stubScaleSpannerInstance.callCount, 0);

    assert.equals(countersStub.incScalingSuccessCounter.callCount, 0);
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[1],
      spanner.maxSize,
    );
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[2],
      'MAX_SIZE',
    );
    assert.equals(countersStub.incScalingFailedCounter.callCount, 0);
  });

  it('should autoscale if suggested size is not equal to current size', async function () {
    const spanner = createSpannerParameters();
    const suggestedSize = spanner.currentSize + 100;
    getSuggestedSizeStub.returns(suggestedSize);

    await processScalingRequest(spanner, createStubState());

    assert.equals(stubScaleSpannerInstance.callCount, 1);
    assert.equals(stubScaleSpannerInstance.getCall(0).args[1], suggestedSize);
    assert.equals(countersStub.incScalingSuccessCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingSuccessCounter.getCall(0).args[1],
      suggestedSize,
    );
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 0);
    assert.equals(countersStub.incScalingFailedCounter.callCount, 0);
  });

  it('should not autoscale if in cooldown period', async function () {
    const spanner = createSpannerParameters();
    const suggestedSize = spanner.currentSize + 100;
    getSuggestedSizeStub.returns(suggestedSize);
    withinCooldownPeriod.returns(true);

    await processScalingRequest(spanner, createStubState());

    assert.equals(stubScaleSpannerInstance.callCount, 0);
    assert.equals(countersStub.incScalingSuccessCounter.callCount, 0);
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[1],
      suggestedSize,
    );
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[2],
      'WITHIN_COOLDOWN',
    );
    assert.equals(countersStub.incScalingFailedCounter.callCount, 0);
  });

  it('Scaling failures increment counter', async function () {
    const spanner = createSpannerParameters();
    const suggestedSize = spanner.currentSize + 100;
    getSuggestedSizeStub.returns(suggestedSize);
    stubScaleSpannerInstance.rejects('Error');

    await processScalingRequest(spanner, createStubState());

    assert.equals(stubScaleSpannerInstance.callCount, 1);
    assert.equals(stubScaleSpannerInstance.getCall(0).args[1], suggestedSize);
    assert.equals(countersStub.incScalingSuccessCounter.callCount, 0);
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 0);
    assert.equals(countersStub.incScalingFailedCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingFailedCounter.getCall(0).args[1],
      suggestedSize,
    );
  });
});
