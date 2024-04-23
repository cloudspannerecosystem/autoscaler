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
const sinon = require('sinon');
// @ts-ignore
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;
const {
  createSpannerParameters,
  createStubState,
  createStateData,
} = require('./test-utils.js');
const {afterEach} = require('mocha');

/**
 * @typedef {import('../../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 * @typedef {import('../state.js').StateData} StateData
 * @typedef {import('../state.js')} State
 */

afterEach(() => {
  // Restore the default sandbox here
  sinon.reset();
  sinon.restore();
});

describe('#getNewMetadata', () => {
  const app = rewire('../index.js');
  const getNewMetadata = app.__get__('getNewMetadata');
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

describe('#processScalingRequest', () => {
  const app = rewire('../index.js');
  const processScalingRequest = app.__get__('processScalingRequest');

  const countersStub = {
    incScalingSuccessCounter: sinon.stub(),
    incScalingFailedCounter: sinon.stub(),
    incScalingDeniedCounter: sinon.stub(),
  };
  const stubScaleSpannerInstance = sinon.stub();
  const getSuggestedSizeStub = sinon.stub();
  const withinCooldownPeriod = sinon.stub();
  const readStateCheckOngoingLRO = sinon.stub();

  beforeEach(() => {
    // Setup common stubs
    stubScaleSpannerInstance.resolves();
    app.__set__('scaleSpannerInstance', stubScaleSpannerInstance);
    app.__set__('Counters', countersStub);
    app.__set__('withinCooldownPeriod', withinCooldownPeriod.returns(false));
    app.__set__('getSuggestedSize', getSuggestedSizeStub);
    app.__set__('readStateCheckOngoingLRO', readStateCheckOngoingLRO);

    readStateCheckOngoingLRO.returns(createStateData());
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
    stubScaleSpannerInstance.returns('scalingOperationId');
    const stateStub = createStubState();

    await processScalingRequest(spanner, stateStub);

    assert.equals(stubScaleSpannerInstance.callCount, 1);
    assert.equals(stubScaleSpannerInstance.getCall(0).args[1], suggestedSize);
    assert.equals(countersStub.incScalingSuccessCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingSuccessCounter.getCall(0).args[1],
      suggestedSize,
    );
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 0);
    assert.equals(countersStub.incScalingFailedCounter.callCount, 0);

    sinon.assert.calledWith(stateStub.updateState, {
      lastScalingTimestamp: stateStub.now,
      createdOn: 0,
      updatedOn: 0,
      lastScalingCompleteTimestamp: null,
      scalingOperationId: 'scalingOperationId',
    });
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

  it('should not autoscale if scalingOperationId is set', async () => {
    // set operation ongoing...
    const stubState = createStubState();
    readStateCheckOngoingLRO.returns({
      lastScalingTimestamp: stubState.now,
      createdOn: 0,
      updatedOn: 0,
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: 'DummyOpID',
    });

    const spanner = createSpannerParameters();
    const suggestedSize = spanner.currentSize + 100;
    getSuggestedSizeStub.returns(suggestedSize);

    await processScalingRequest(spanner, stubState);

    assert.equals(stubScaleSpannerInstance.callCount, 0);
    assert.equals(countersStub.incScalingSuccessCounter.callCount, 0);
    assert.equals(countersStub.incScalingDeniedCounter.callCount, 1);
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[1],
      spanner.currentSize + 100,
    );
    assert.equals(
      countersStub.incScalingDeniedCounter.getCall(0).args[2],
      'IN_PROGRESS',
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

describe('#withinCooldownPeriod', () => {
  const app = rewire('../index.js');
  const withinCooldownPeriod = app.__get__('withinCooldownPeriod');

  /** @type {StateData} */
  let autoscalerState;
  /** @type {AutoscalerSpanner} */
  let spannerParams;

  const lastScalingTime = Date.parse('2024-01-01T12:00:00Z');
  const MILLIS_PER_MINUTE = 60_000;

  beforeEach(() => {
    spannerParams = createSpannerParameters();

    autoscalerState = {
      lastScalingCompleteTimestamp: lastScalingTime,
      scalingOperationId: null,
      lastScalingTimestamp: lastScalingTime,
      createdOn: 0,
      updatedOn: 0,
    };
  });

  it('should be false when no scaling has ever happened', () => {
    autoscalerState.lastScalingCompleteTimestamp = 0;
    autoscalerState.lastScalingTimestamp = 0;

    assert.isFalse(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize + 100,
        autoscalerState,
        lastScalingTime,
      ),
    );
  });

  it('should be false when scaling up later than cooldown', () => {
    // test at 1 min after end of cooldown...
    const testTime =
      lastScalingTime +
      (spannerParams.scaleOutCoolingMinutes + 1) * MILLIS_PER_MINUTE;

    assert.isFalse(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize + 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be false when scaling down later than cooldown', () => {
    // test at 1 min before end of cooldown...
    const testTime =
      lastScalingTime +
      (spannerParams.scaleInCoolingMinutes + 1) * MILLIS_PER_MINUTE;

    assert.isFalse(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize - 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be false when overloaded after overloadCoolingMinutes', () => {
    spannerParams.isOverloaded = true;
    spannerParams.overloadCoolingMinutes = 30;
    // test at 1 min after end of cooldown...
    const testTime =
      lastScalingTime +
      (spannerParams.overloadCoolingMinutes + 1) * MILLIS_PER_MINUTE;

    assert.isFalse(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize + 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be true when overloaded and within overloadCoolingMinutes', () => {
    spannerParams.isOverloaded = true;
    spannerParams.overloadCoolingMinutes = 30;

    // test at 29 mins later...
    assert.isTrue(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize + 100,
        autoscalerState,
        lastScalingTime + 29 * 60 * 1_000,
      ),
    );
  });

  it('should be true when scaling up within scaleOutCoolingMinutes', () => {
    // test at 1 min before end of cooldown...
    const testTime =
      lastScalingTime +
      (spannerParams.scaleOutCoolingMinutes - 1) * MILLIS_PER_MINUTE;

    assert.isTrue(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize + 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should be true when scaling down within scaleInCoolingMinutes', () => {
    // test at 1 min before end of cooldown...
    const testTime =
      lastScalingTime +
      (spannerParams.scaleInCoolingMinutes - 1) * MILLIS_PER_MINUTE;

    assert.isTrue(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize - 100,
        autoscalerState,
        testTime,
      ),
    );
  });

  it('should use lastScalingCompleteTimestamp when specified', () => {
    autoscalerState.lastScalingTimestamp = 0;

    assert.isTrue(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize - 100,
        autoscalerState,
        lastScalingTime,
      ),
    );
  });

  it('should use lastScalingTimestamp if complete not specified', () => {
    autoscalerState.lastScalingCompleteTimestamp = 0;

    assert.isTrue(
      withinCooldownPeriod(
        spannerParams,
        spannerParams.currentSize - 100,
        autoscalerState,
        lastScalingTime,
      ),
    );
  });
});

describe('#readStateCheckOngoingLRO', () => {
  const app = rewire('../index.js');
  const readStateCheckOngoingLRO = app.__get__('readStateCheckOngoingLRO');

  const countersStub = {
    incScalingFailedCounter: sinon.stub(),
  };

  /** @type {StateData} */
  let autoscalerState;
  /** @type {StateData} */
  let originalAutoscalerState;
  /** @type {AutoscalerSpanner} */
  let spannerParams;
  /** @type {sinon.SinonStubbedInstance<State>} */
  let stateStub;
  /** @type {*} */
  let operation;

  const getOperation = sinon.stub();
  const fakeSpannerAPI = {
    projects: {
      instances: {
        operations: {
          get: getOperation,
        },
      },
    },
  };
  app.__set__('spannerRestApi', fakeSpannerAPI);
  app.__set__('Counters', countersStub);

  const lastScalingDate = new Date('2024-01-01T12:00:00Z');

  beforeEach(() => {
    spannerParams = createSpannerParameters();
    stateStub = createStubState();

    // A State with an ongoing operation
    autoscalerState = {
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: 'OperationId',
      lastScalingTimestamp: lastScalingDate.getTime(),
      createdOn: 0,
      updatedOn: 0,
    };
    originalAutoscalerState = {...autoscalerState};

    operation = {
      done: null,
      error: null,
      metadata: {
        '@type':
          'type.googleapis.com' +
          '/google.spanner.admin.instance.v1.UpdateInstanceMetadata',
        'instance': {
          nodeCount: 2,
          processingUnits: 2000,
        },
        'endTime': null,
        'startTime': lastScalingDate.toISOString(),
      },
    };
  });

  afterEach(() => {
    getOperation.reset();
    Object.values(countersStub).forEach((stub) => stub.reset());
  });

  it('should no-op when no LRO ID in state', async () => {
    autoscalerState.scalingOperationId = null;

    stateStub.get.resolves(autoscalerState);
    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
    };
    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      expectedState,
    );
    sinon.assert.notCalled(getOperation);
    sinon.assert.notCalled(stateStub.updateState);
  });

  it('should clear the operation if operation.get fails', async () => {
    stateStub.get.resolves(autoscalerState);
    getOperation.rejects(new Error('operation.get() error'));

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      lastScalingCompleteTimestamp: lastScalingDate.getTime(),
    };
    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
  });

  it('should clear the operation if operation.get returns null', async () => {
    stateStub.get.resolves(autoscalerState);
    getOperation.resolves({data: null});

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      lastScalingCompleteTimestamp: lastScalingDate.getTime(),
    };
    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
  });

  it('should clear lastScaling  and increment counter if op failed with error', async () => {
    stateStub.get.resolves(autoscalerState);
    operation.done = true;
    operation.error = {message: 'Scaling op failed'};
    operation.metadata.endTime = // 60 seconds after start
      new Date(lastScalingDate.getTime() + 60_000).toISOString();
    getOperation.resolves({data: operation});

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      lastScalingCompleteTimestamp: 0,
      lastScalingTimestamp: 0,
    };
    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
    assert.equals(countersStub.incScalingFailedCounter.callCount, 1);
  });

  it('should clear the operation if no metadata', async () => {
    stateStub.get.resolves(autoscalerState);
    operation.metadata = null;
    getOperation.resolves({data: operation});

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      lastScalingCompleteTimestamp: lastScalingDate.getTime(),
    };
    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
  });

  it('should leave state unchanged if op not done yet', async () => {
    stateStub.get.resolves(autoscalerState);
    operation.done = false;
    getOperation.resolves({data: operation});

    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      originalAutoscalerState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, originalAutoscalerState);
  });

  it('should update timestamp and clear ID when completed', async () => {
    stateStub.get.resolves(autoscalerState);
    // 60 seconds after start
    const endTime = lastScalingDate.getTime() + 60_000;
    operation.done = true;
    operation.metadata.endTime = new Date(endTime).toISOString();
    getOperation.resolves({data: operation});

    const expectedState = {
      ...originalAutoscalerState,
      scalingOperationId: null,
      lastScalingCompleteTimestamp: endTime,
    };
    assert.equals(
      await readStateCheckOngoingLRO(spannerParams, stateStub),
      expectedState,
    );

    sinon.assert.calledOnce(getOperation);
    sinon.assert.calledWith(stateStub.updateState, expectedState);
  });
});
