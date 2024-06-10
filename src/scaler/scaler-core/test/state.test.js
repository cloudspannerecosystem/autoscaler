/* Copyright 2024 Google LLC
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

const firestore = require('@google-cloud/firestore');
const spanner = require('@google-cloud/spanner');
const {AutoscalerUnits} = require('../../../autoscaler-common/types');
const rewire = require('rewire');
const sinon = require('sinon');
// @ts-ignore
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;

/**
 * @typedef {import('../../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 */

// Create a dummy Firestore module with a dummy class constructor
// that returns a stub instance.
const stubFirestoreConstructor = sinon.stub();
/** Dummy class to return the Firestore stub */
class DummyFirestoreClass {
  /** @param {AutoscalerSpanner} arg */
  constructor(arg) {
    return stubFirestoreConstructor(arg);
  }
}
const dummyFirestoreModule = {
  Firestore: DummyFirestoreClass,
  Timestamp: firestore.Timestamp,
  FieldValue: firestore.FieldValue,
};

const stubSpannerConstructor = sinon.stub();
/** Dummy class to return the Spanner stub */
class DummySpannerClass {
  /** @param {AutoscalerSpanner} arg */
  constructor(arg) {
    return stubSpannerConstructor(arg);
  }
  // @ts-ignore
  // eslint-disable-next-line require-jsdoc
  static timestamp(arg) {
    return spanner.Spanner.timestamp(arg);
  }
}
const dummySpannerModule = {
  Spanner: DummySpannerClass,
};

// import module to define State type for typechecking...
let State = require('../state');
// override module with rewired module
// @ts-ignore
State = rewire('../state.js');

// @ts-expect-error
State.__set__('firestore', dummyFirestoreModule);
// @ts-expect-error
State.__set__('spanner', dummySpannerModule);
// @ts-expect-error
const StateFirestore = State.__get__('StateFirestore');
// @ts-expect-error
const StateSpanner = State.__get__('StateSpanner');

afterEach(() => {
  // Restore the default sandbox here
  sinon.reset();
  sinon.restore();
});

const DUMMY_TIMESTAMP = 1704110400000;
const DUMMY_TIMESTAMP2 = 1709660000000;

/** @type {AutoscalerSpanner} */
const BASE_CONFIG = {
  projectId: 'myProject',
  instanceId: 'myInstance',
  stateProjectId: 'stateProject',
  scalingMethod: 'LINEAR',
  units: AutoscalerUnits.PROCESSING_UNITS,
  scaleOutCoolingMinutes: 30,
  scaleInCoolingMinutes: 5,
  overloadCoolingMinutes: 10,
  currentSize: 100,
  currentNodes: 0,
  regional: true,
  isOverloaded: false,
  metrics: [],
  minSize: 1,
  maxSize: 200,
  stepSize: 10,
  overloadStepSize: 10,
  currentNumDatabases: 1,
};

describe('stateFirestoreTests', () => {
  /** @type {sinon.SinonStubbedInstance<firestore.Firestore>} */
  let stubFirestoreInstance;
  /** @type {sinon.SinonStubbedInstance<firestore.DocumentReference<any>>} */
  let newDocRef;
  /** @type {sinon.SinonStubbedInstance<firestore.DocumentReference<any>>} */
  let oldDocRef;

  const DUMMY_FIRESTORE_TIMESTAMP =
    firestore.Timestamp.fromMillis(DUMMY_TIMESTAMP);
  const DUMMY_FIRESTORE_TIMESTAMP2 =
    firestore.Timestamp.fromMillis(DUMMY_TIMESTAMP2);

  const NEW_DOC_PATH =
    'spannerAutoscaler/state/projects/myProject/instances/myInstance';
  const OLD_DOC_PATH = 'spannerAutoscaler/myInstance';

  /** @type {AutoscalerSpanner} */
  const autoscalerConfig = {
    ...BASE_CONFIG,
  };

  /** @type {firestore.DocumentSnapshot<any>} */
  // @ts-ignore
  const EXISTING_DOC = {
    exists: true,
    data: () => {
      return {
        createdOn: DUMMY_FIRESTORE_TIMESTAMP,
        updatedOn: DUMMY_FIRESTORE_TIMESTAMP,
        lastScalingTimestamp: DUMMY_FIRESTORE_TIMESTAMP,
        lastScalingCompleteTimestamp: DUMMY_FIRESTORE_TIMESTAMP,
        scalingOperationId: null,
        scalingRequestedSize: null,
        scalingMethod: null,
        scalingPreviousSize: null,
      };
    },
  };

  /** @type {firestore.DocumentSnapshot<any>} */
  // @ts-ignore
  const NON_EXISTING_DOC = {
    exists: false,
    data: () => null,
  };

  beforeEach(() => {
    // stub instances need to be recreated before each test.
    stubFirestoreInstance = sinon.createStubInstance(firestore.Firestore);
    stubFirestoreConstructor.reset();
    stubFirestoreConstructor.returns(stubFirestoreInstance);
    newDocRef = sinon.createStubInstance(firestore.DocumentReference);
    oldDocRef = sinon.createStubInstance(firestore.DocumentReference);
    stubFirestoreInstance.doc.withArgs(NEW_DOC_PATH).returns(newDocRef);
    stubFirestoreInstance.doc.withArgs(OLD_DOC_PATH).returns(oldDocRef);
    // Clear cached Firestore instances from the memoized function in
    // StateFirestore:
    StateFirestore.getFirestoreClient.cache.clear();
  });

  it('should create a StateFirestore object on spanner projectId', function () {
    const config = {
      ...autoscalerConfig,
    };
    delete config.stateProjectId;
    const state = State.buildFor(config);
    assert.equals(state.constructor.name, 'StateFirestore');
    sinon.assert.calledWith(stubFirestoreConstructor, {projectId: 'myProject'});
  });

  it('should create a StateFirestore object connecting to stateProjectId', function () {
    const state = State.buildFor(autoscalerConfig);
    assert.equals(state.constructor.name, 'StateFirestore');
    sinon.assert.calledWith(stubFirestoreConstructor, {
      projectId: 'stateProject',
    });
  });

  it('should reuse the Firestore clients for each project', function () {
    const config1 = {
      ...autoscalerConfig,
      stateProjectId: 'stateProject1',
    };
    const config2 = {
      ...autoscalerConfig,
      stateProjectId: 'stateProject2',
    };

    State.buildFor(config1);
    State.buildFor(config2);
    State.buildFor(config1);
    State.buildFor(config2);
    State.buildFor(config1);
    State.buildFor(config2);

    const calls = stubFirestoreConstructor.getCalls();
    assert.equals(calls.length, 2);
    assert.equals(calls[0].args[0], {
      projectId: 'stateProject1',
    });
    assert.equals(calls[1].args[0], {
      projectId: 'stateProject2',
    });
  });

  it('get() should read document from collection when exists', async function () {
    // @ts-ignore
    newDocRef.get.returns(Promise.resolve(EXISTING_DOC));

    const state = State.buildFor(autoscalerConfig);
    const data = await state.get();

    sinon.assert.calledOnce(newDocRef.get);
    sinon.assert.calledWith(stubFirestoreInstance.doc, NEW_DOC_PATH);

    // timestamp was converted...
    assert.equals(data, {
      createdOn: DUMMY_TIMESTAMP,
      updatedOn: DUMMY_TIMESTAMP,
      lastScalingTimestamp: DUMMY_TIMESTAMP,
      lastScalingCompleteTimestamp: DUMMY_TIMESTAMP,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    });
  });

  it('get() should create a document when it does not exist', async function () {
    newDocRef.get.returns(Promise.resolve(NON_EXISTING_DOC));
    oldDocRef.get.returns(Promise.resolve(NON_EXISTING_DOC));

    const state = State.buildFor(autoscalerConfig);
    // make state.now return a fixed value
    const nowfunc = sinon.stub();
    sinon.replaceGetter(state, 'now', nowfunc);
    nowfunc.returns(DUMMY_TIMESTAMP);

    const data = await state.get();

    const expectedValue = {
      lastScalingTimestamp: 0,
      createdOn: DUMMY_TIMESTAMP,
      updatedOn: DUMMY_TIMESTAMP,
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };

    const expectedDoc = {
      createdOn: DUMMY_FIRESTORE_TIMESTAMP,
      updatedOn: DUMMY_FIRESTORE_TIMESTAMP,
      lastScalingTimestamp: firestore.Timestamp.fromMillis(0),
      lastScalingCompleteTimestamp: firestore.Timestamp.fromMillis(0),
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };

    sinon.assert.calledTwice(stubFirestoreInstance.doc);
    // first call to create docref is for the "new" path
    assert.equals(stubFirestoreInstance.doc.getCall(0).args[0], NEW_DOC_PATH);
    // second call to create docref is for the "old" path
    assert.equals(stubFirestoreInstance.doc.getCall(1).args[0], OLD_DOC_PATH);

    sinon.assert.calledOnce(newDocRef.get);
    sinon.assert.calledOnce(oldDocRef.get);

    sinon.assert.calledOnce(newDocRef.set);
    assert.equals(newDocRef.set.getCall(0).args[0], expectedDoc);
    assert.equals(data, expectedValue);
  });

  it('get() should copy document from old location to new if missing in new', async function () {
    /**
     * Due to [issue 213](https://github.com/cloudspannerecosystem/autoscaler/issues/213)
     * the docRef had to be changed, so check for an old doc at the old
     * docref, if it exists, copy it to the new docref, delete it and
     * return it.
     */
    newDocRef.get.returns(Promise.resolve(NON_EXISTING_DOC));
    oldDocRef.get.returns(Promise.resolve(EXISTING_DOC));

    const state = State.buildFor(autoscalerConfig);
    const data = await state.get();

    // Expected value set and returned is the old doc.
    const expected = {
      lastScalingTimestamp: DUMMY_TIMESTAMP,
      createdOn: DUMMY_TIMESTAMP,
      updatedOn: DUMMY_TIMESTAMP,
      lastScalingCompleteTimestamp: DUMMY_TIMESTAMP,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };

    sinon.assert.calledTwice(stubFirestoreInstance.doc);
    // first call to create docref is for the "new" path
    assert.equals(stubFirestoreInstance.doc.getCall(0).args[0], NEW_DOC_PATH);
    // second call to create docref is for the "old" path
    assert.equals(stubFirestoreInstance.doc.getCall(1).args[0], OLD_DOC_PATH);

    sinon.assert.calledOnce(newDocRef.get);
    sinon.assert.calledOnce(oldDocRef.get);

    // Copy data from existing doc in old location to new location.
    sinon.assert.calledOnce(newDocRef.set);
    assert.equals(newDocRef.set.getCall(0).args[0], EXISTING_DOC.data());
    sinon.assert.calledOnce(oldDocRef.delete);

    // return data from existing doc.
    assert.equals(data, expected);
  });

  it('updateState() should write document to collection', async function () {
    // set calls get(), so give it a doc to return...
    newDocRef.get.returns(Promise.resolve(EXISTING_DOC));

    const state = State.buildFor(autoscalerConfig);

    // make state.now return a fixed value
    const nowfunc = sinon.stub();
    sinon.replaceGetter(state, 'now', nowfunc);
    nowfunc.returns(DUMMY_TIMESTAMP2);

    const doc = await state.get();
    doc.lastScalingTimestamp = DUMMY_TIMESTAMP2;
    await state.updateState(doc);

    sinon.assert.calledOnce(stubFirestoreInstance.doc);
    assert.equals(stubFirestoreInstance.doc.getCall(0).args[0], NEW_DOC_PATH);

    sinon.assert.calledOnce(newDocRef.update);
    assert.equals(newDocRef.update.getCall(0).args[0], {
      updatedOn: DUMMY_FIRESTORE_TIMESTAMP2,
      lastScalingTimestamp: DUMMY_FIRESTORE_TIMESTAMP2,
      lastScalingCompleteTimestamp: DUMMY_FIRESTORE_TIMESTAMP,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    });
  });
});

describe('stateSpannerTests', () => {
  /** @type {sinon.SinonStubbedInstance<spanner.Spanner>} */
  let stubSpannerClient;
  /** @type {sinon.SinonStubbedInstance<spanner.Instance>} */
  let stubSpannerInstance;
  /** @type {sinon.SinonStubbedInstance<spanner.Database>} */
  let stubSpannerDatabase;
  /** @type {sinon.SinonStubbedInstance<spanner.Table>} */
  let stubSpannerTable;

  const autoscalerConfig = {
    ...BASE_CONFIG,
    stateDatabase: {
      name: 'spanner',
      instanceId: 'stateInstanceId',
      databaseId: 'stateDatabaseId',
    },
  };

  const expectedRowId = 'projects/myProject/instances/myInstance';
  const expectedQuery = {
    columns: [
      'lastScalingTimestamp',
      'createdOn',
      'updatedOn',
      'lastScalingCompleteTimestamp',
      'scalingOperationId',
      'scalingRequestedSize',
      'scalingPreviousSize',
      'scalingMethod',
    ],
    keySet: {
      keys: [
        {
          values: [
            {
              stringValue: expectedRowId,
            },
          ],
        },
      ],
    },
  };

  const VALID_ROW = {
    toJSON: () => {
      return {
        lastScalingTimestamp: new Date(DUMMY_TIMESTAMP),
        createdOn: new Date(DUMMY_TIMESTAMP),
        updatedOn: new Date(DUMMY_TIMESTAMP),
        lastScalingCompleteTimestamp: new Date(DUMMY_TIMESTAMP),
        scalingOperationId: null,
        scalingRequestedSize: null,
        scalingMethod: null,
        scalingPreviousSize: null,
      };
    },
  };

  const SPANNER_EPOCH_ISO_TIME = new Date(0).toISOString();
  const DUMMY_SPANNER_ISO_TIME = new Date(DUMMY_TIMESTAMP).toISOString();
  const DUMMY_SPANNER_ISO_TIME2 = new Date(DUMMY_TIMESTAMP2).toISOString();

  beforeEach(() => {
    stubSpannerClient = sinon.createStubInstance(spanner.Spanner);
    stubSpannerInstance = sinon.createStubInstance(spanner.Instance);
    stubSpannerDatabase = sinon.createStubInstance(spanner.Database);
    stubSpannerTable = sinon.createStubInstance(spanner.Table);

    stubSpannerConstructor.reset();
    stubSpannerConstructor.returns(stubSpannerClient);
    stubSpannerClient.instance.returns(stubSpannerInstance);
    stubSpannerInstance.database.returns(stubSpannerDatabase);
    stubSpannerDatabase.table.returns(stubSpannerTable);

    // Clear cached Spanner DB instances from the memoized function in
    // StateSpanner
    StateSpanner.getSpannerDatabaseClient.cache.clear();
  });

  it('should create a StateSpanner object connecting to spanner projectId', function () {
    const config = {
      ...autoscalerConfig,
    };
    delete config.stateProjectId;
    const state = State.buildFor(config);
    assert.equals(state.constructor.name, 'StateSpanner');
    sinon.assert.calledWith(stubSpannerConstructor, {
      projectId: autoscalerConfig.projectId,
    });
    sinon.assert.calledWith(
      stubSpannerClient.instance,
      autoscalerConfig.stateDatabase.instanceId,
    );
    sinon.assert.calledWith(
      stubSpannerInstance.database,
      autoscalerConfig.stateDatabase.databaseId,
    );
    sinon.assert.calledWith(stubSpannerDatabase.table, 'spannerAutoscaler');
  });

  it('should create a StateSpanner object connecting to stateProjectId', function () {
    const state = State.buildFor(autoscalerConfig);
    assert.equals(state.constructor.name, 'StateSpanner');
    sinon.assert.calledWith(stubSpannerConstructor, {
      projectId: autoscalerConfig.stateProjectId,
    });
    sinon.assert.calledWith(
      stubSpannerClient.instance,
      autoscalerConfig.stateDatabase.instanceId,
    );
    sinon.assert.calledWith(
      stubSpannerInstance.database,
      autoscalerConfig.stateDatabase.databaseId,
    );
    sinon.assert.calledWith(stubSpannerDatabase.table, 'spannerAutoscaler');
  });

  it('should reuse the Spanner clients for each database', function () {
    const config1 = {
      ...autoscalerConfig,
      stateProjectId: 'stateProject1',
      stateDatabase: {
        name: 'spanner',
        instanceId: 'stateInstanceId1',
        databaseId: 'stateDatabaseId1',
      },
    };
    const config2 = {
      ...autoscalerConfig,
      stateProjectId: 'stateProject2',
      stateDatabase: {
        name: 'spanner',
        instanceId: 'stateInstanceId2',
        databaseId: 'stateDatabaseId2',
      },
    };

    State.buildFor(config1);
    State.buildFor(config2);
    State.buildFor(config1);
    State.buildFor(config2);
    State.buildFor(config1);
    State.buildFor(config2);

    // get client for project
    assert.equals(stubSpannerConstructor.getCalls().length, 2);
    assert.equals(stubSpannerConstructor.firstCall.args[0], {
      projectId: 'stateProject1',
    });
    assert.equals(stubSpannerConstructor.secondCall.args[0], {
      projectId: 'stateProject2',
    });

    // get instance for project
    assert.equals(stubSpannerClient.instance.getCalls().length, 2);
    assert.equals(
      stubSpannerClient.instance.firstCall.args[0],
      config1.stateDatabase.instanceId,
    );
    assert.equals(
      stubSpannerClient.instance.secondCall.args[0],
      config2.stateDatabase.instanceId,
    );

    // get database from instance
    assert.equals(stubSpannerInstance.database.getCalls().length, 2);
    assert.equals(
      stubSpannerInstance.database.firstCall.args[0],
      config1.stateDatabase.databaseId,
    );
    assert.equals(
      stubSpannerInstance.database.secondCall.args[0],
      config2.stateDatabase.databaseId,
    );
  });

  it('get() should read document from table when exists', async function () {
    // @ts-ignore
    stubSpannerTable.read.returns(Promise.resolve([[VALID_ROW]]));

    const state = State.buildFor(autoscalerConfig);
    const data = await state.get();

    assert.equals(stubSpannerTable.read.callCount, 1);
    assert.equals(stubSpannerTable.read.args[0][0], expectedQuery);
    assert.equals(data, {
      createdOn: DUMMY_TIMESTAMP,
      updatedOn: DUMMY_TIMESTAMP,
      lastScalingTimestamp: DUMMY_TIMESTAMP,
      lastScalingCompleteTimestamp: DUMMY_TIMESTAMP,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
    });
  });

  it('get() should create a document when it does not exist', async function () {
    // @ts-ignore
    stubSpannerTable.read.returns(Promise.resolve([[]]));

    const state = State.buildFor(autoscalerConfig);
    // make state.now return a fixed value
    const nowfunc = sinon.stub();
    sinon.replaceGetter(state, 'now', nowfunc);
    nowfunc.returns(DUMMY_TIMESTAMP);

    const data = await state.get();

    assert.equals(stubSpannerTable.upsert.callCount, 1);
    assert.equals(stubSpannerTable.upsert.args[0][0], {
      lastScalingTimestamp: SPANNER_EPOCH_ISO_TIME,
      createdOn: DUMMY_SPANNER_ISO_TIME,
      updatedOn: DUMMY_SPANNER_ISO_TIME,
      lastScalingCompleteTimestamp: SPANNER_EPOCH_ISO_TIME,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
      id: expectedRowId,
    });

    assert.equals(data, {
      lastScalingTimestamp: 0,
      lastScalingCompleteTimestamp: 0,
      createdOn: DUMMY_TIMESTAMP,
      updatedOn: DUMMY_TIMESTAMP,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    });
  });

  it('updateState() should write document to table', async function () {
    // @ts-ignore
    stubSpannerTable.read.returns(Promise.resolve([[VALID_ROW]]));

    const state = State.buildFor(autoscalerConfig);

    // make state.now return a fixed value
    const nowfunc = sinon.stub();
    sinon.replaceGetter(state, 'now', nowfunc);
    nowfunc.returns(DUMMY_TIMESTAMP);

    const doc = await state.get();

    nowfunc.returns(DUMMY_TIMESTAMP2);
    doc.lastScalingTimestamp = DUMMY_TIMESTAMP2;
    await state.updateState(doc);

    sinon.assert.calledWith(stubSpannerTable.upsert, {
      updatedOn: DUMMY_SPANNER_ISO_TIME2,
      lastScalingTimestamp: DUMMY_SPANNER_ISO_TIME2,
      lastScalingCompleteTimestamp: DUMMY_SPANNER_ISO_TIME,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
      id: expectedRowId,
    });
  });

  it('get() should retry without newSchemaCols when ColumnNotFound', async function () {
    const expectedQueryWithNoNewCols = {
      ...expectedQuery,
      columns: [
        'lastScalingTimestamp',
        'createdOn',
        'updatedOn',
        'lastScalingCompleteTimestamp',
        'scalingOperationId',
      ],
    };

    stubSpannerTable.read
      .onCall(0)
      // @ts-ignore
      .rejects(
        new Error('5 NOT_FOUND Column not found in table stateTable: someCol'),
      );
    // @ts-ignore
    stubSpannerTable.read.onCall(1).resolves([[VALID_ROW]]);

    const state = State.buildFor(autoscalerConfig);
    // make state.now return a fixed value
    const nowfunc = sinon.stub();
    sinon.replaceGetter(state, 'now', nowfunc);
    nowfunc.returns(DUMMY_TIMESTAMP);

    const data = await state.get();

    assert.equals(stubSpannerTable.read.callCount, 2);
    assert.equals(stubSpannerTable.read.args[0][0], expectedQuery);
    assert.equals(stubSpannerTable.read.args[1][0], expectedQueryWithNoNewCols);

    assert.equals(data, {
      createdOn: DUMMY_TIMESTAMP,
      updatedOn: DUMMY_TIMESTAMP,
      lastScalingTimestamp: DUMMY_TIMESTAMP,
      lastScalingCompleteTimestamp: DUMMY_TIMESTAMP,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingPreviousSize: null,
      scalingMethod: null,
    });
  });

  it('updateState() should retry without newSchemaCols when ColumnNotFound', async function () {
    // @ts-ignore
    stubSpannerTable.read.returns(Promise.resolve([[VALID_ROW]]));
    stubSpannerTable.upsert
      .onCall(0)
      // @ts-ignore
      .rejects(
        new Error('5 NOT_FOUND Column not found in table stateTable: someCol'),
      );
    // @ts-ignore
    stubSpannerTable.upsert.onCall(1).resolves();

    const state = State.buildFor(autoscalerConfig);

    // make state.now return a fixed value
    const nowfunc = sinon.stub();
    sinon.replaceGetter(state, 'now', nowfunc);
    nowfunc.returns(DUMMY_TIMESTAMP);

    const doc = await state.get();

    nowfunc.returns(DUMMY_TIMESTAMP2);
    doc.lastScalingTimestamp = DUMMY_TIMESTAMP2;
    await state.updateState(doc);

    assert.equals(stubSpannerTable.upsert.callCount, 2);
    assert.equals(stubSpannerTable.upsert.args[0][0], {
      updatedOn: DUMMY_SPANNER_ISO_TIME2,
      lastScalingTimestamp: DUMMY_SPANNER_ISO_TIME2,
      lastScalingCompleteTimestamp: DUMMY_SPANNER_ISO_TIME,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
      id: expectedRowId,
    });
    assert.equals(stubSpannerTable.upsert.args[1][0], {
      updatedOn: DUMMY_SPANNER_ISO_TIME2,
      lastScalingTimestamp: DUMMY_SPANNER_ISO_TIME2,
      lastScalingCompleteTimestamp: DUMMY_SPANNER_ISO_TIME,
      scalingOperationId: null,
      id: expectedRowId,
    });
  });
});
