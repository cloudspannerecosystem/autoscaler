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

const rewire = require('rewire');
// eslint-disable-next-line no-unused-vars
const should = require('should');
const sinon = require('sinon');
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
  // eslint-disable-next-line require-jsdoc
  static timestamp(arg) {
    return spanner.Spanner.timestamp(arg);
  }
}

const State = rewire('../state.js');

State.__set__('firestore', dummyFirestoreModule);
State.__set__('Spanner', DummySpannerClass);

afterEach(() => {
  // Restore the default sandbox here
  sinon.reset();
  sinon.restore();
});

const DUMMY_TIMESTAMP = 1704110400000;

describe('stateFirestoreTests', () => {
  let stubFirestoreInstance = sinon.createStubInstance(firestore.Firestore);
  let collectionRef = sinon
      .createStubInstance(firestore.CollectionReference);
  let docRef = sinon.createStubInstance(firestore.DocumentReference);

  const autoscalerConfig = {
    projectId: 'myProject',
    instanceId: 'myInstance',
    stateProjectId: 'stateProject',
  };

  const DUMMY_FIRESTORE_TIMESTAMP = firestore.Timestamp
      .fromMillis(DUMMY_TIMESTAMP);

  beforeEach(() => {
    stubFirestoreInstance = sinon.createStubInstance(firestore.Firestore);
    collectionRef = sinon
        .createStubInstance(firestore.CollectionReference);
    docRef = sinon.createStubInstance(firestore.DocumentReference);
    stubFirestoreConstructor.returns(stubFirestoreInstance);
    stubFirestoreInstance.collection.returns(collectionRef);
    collectionRef.doc.returns(docRef);
  });

  it('should create a StateFirestore object on spanner projectId',
      function() {
        const config = {
          ...autoscalerConfig,
          stateProjectId: null,
        };
        const state = State.buildFor(config);
        assert.equals(state.constructor.name, 'StateFirestore');
        sinon.assert.calledWith(stubFirestoreConstructor,
            {projectId: 'myProject'});
      });

  it('should create a StateFirestore object connecting to stateProjectId',
      function() {
        const state = State.buildFor(autoscalerConfig);
        assert.equals(state.constructor.name, 'StateFirestore');
        sinon.assert.calledWith(stubFirestoreConstructor,
            {projectId: 'stateProject'});
      });

  it('get() should read document from collection when exists',
      async function() {
        // @ts-ignore
        docRef.get.returns(Promise.resolve({
          exists: true,
          data: () => {
            return {
              updatedOn: DUMMY_FIRESTORE_TIMESTAMP,
              lastScalingTimestamp:
                  DUMMY_FIRESTORE_TIMESTAMP,
            };
          },
        }));

        const state = State.buildFor(autoscalerConfig);
        const data = await state.get();

        sinon.assert.calledWith(stubFirestoreInstance.collection,
            'spannerAutoscaler');
        sinon.assert.calledWith(collectionRef.doc, 'myInstance');
        // timestamp was converted...
        assert.equals(data, {
          updatedOn: DUMMY_TIMESTAMP,
          lastScalingTimestamp: DUMMY_TIMESTAMP});
      });

  it('get() should create a document when it does not exist',
      async function() {
        // @ts-ignore
        docRef.get.returns(Promise.resolve({
          exists: false,
        }));

        const state = State.buildFor(autoscalerConfig);
        const data = await state.get();

        const expected = {
          lastScalingTimestamp: 0,
          createdOn: firestore.FieldValue.serverTimestamp(),
        };

        assert.equals(docRef.set.getCall(0).args[0], expected);
        assert.equals(data, expected);
      });

  it('set() should write document to collection',
      async function() {
        // set calls get(), so give it a doc to return...
        // @ts-ignore
        docRef.get.returns(Promise.resolve({
          exists: true,
          data: () => {
            return {
              test: 'testdoc',
            };
          },
        }));

        const state = State.buildFor(autoscalerConfig);
        await state.set();

        assert.equals(docRef.update.getCall(0).args[0], {
          updatedOn: firestore.FieldValue.serverTimestamp(),
          lastScalingTimestamp: firestore.FieldValue.serverTimestamp(),
        });
      });
});

describe('stateSpannerTests', () => {
  let stubSpannerClient = sinon.createStubInstance(spanner.Spanner);
  let stubSpannerInstance = sinon.createStubInstance(spanner.Instance);
  let stubSpannerDatabase = sinon.createStubInstance(spanner.Database);
  let stubSpannerTable = sinon.createStubInstance(spanner.Table);

  const autoscalerConfig = {
    projectId: 'myProject',
    instanceId: 'myInstance',
    stateProjectId: 'stateProject',
    stateDatabase: {
      name: 'spanner',
      instanceId: 'stateInstanceId',
      databaseId: 'stateDatabaseId',
    },
  };

  const expectedRowId = 'projects/myProject/instances/myInstance';
  const expectedQuery = {
    columns: ['lastScalingTimestamp', 'createdOn'],
    keySet: {
      keys: [{
        values: [{
          stringValue: expectedRowId,
        }],
      }],
    },
  };

  const DUMMY_SPANNER_ISO_TIME = spanner.Spanner.timestamp(DUMMY_TIMESTAMP)
      .toISOString();

  beforeEach(() => {
    stubSpannerClient = sinon.createStubInstance(spanner.Spanner);
    stubSpannerInstance = sinon.createStubInstance(spanner.Instance);
    stubSpannerDatabase = sinon.createStubInstance(spanner.Database);
    stubSpannerTable = sinon.createStubInstance(spanner.Table);

    stubSpannerConstructor.returns(stubSpannerClient);
    stubSpannerClient.instance.returns(stubSpannerInstance);
    stubSpannerInstance.database.returns(stubSpannerDatabase);
    stubSpannerDatabase.table.returns(stubSpannerTable);
  });


  it('should create a StateSpanner object on spanner projectId',
      function() {
        const config = {
          ...autoscalerConfig,
          stateProjectId: null,
        };
        const state = State.buildFor(config);
        assert.equals(state.constructor.name, 'StateSpanner');
        sinon.assert.calledWith(stubSpannerConstructor,
            {projectId: 'myProject'});
        sinon.assert.calledWith(stubSpannerClient.instance,
            autoscalerConfig.stateDatabase.instanceId);
        sinon.assert.calledWith(stubSpannerInstance.database,
            autoscalerConfig.stateDatabase.databaseId);
        sinon.assert.calledWith(stubSpannerDatabase.table,
            'spannerAutoscaler');
      });

  it('should create a StateSpanner object connecting to stateProjectId',
      function() {
        const state = State.buildFor(autoscalerConfig);
        assert.equals(state.constructor.name, 'StateSpanner');
        sinon.assert.calledWith(stubSpannerConstructor,
            {projectId: 'stateProject'});
        sinon.assert.calledWith(stubSpannerClient.instance,
            autoscalerConfig.stateDatabase.instanceId);
        sinon.assert.calledWith(stubSpannerInstance.database,
            autoscalerConfig.stateDatabase.databaseId);
        sinon.assert.calledWith(stubSpannerDatabase.table,
            'spannerAutoscaler');
      });

  it('get() should read document from collection when exists',
      async function() {
        // @ts-ignore
        stubSpannerTable.read.returns(Promise.resolve([[
          {
            toJSON: () => {
              return {
                lastScalingTimestamp: new Date(DUMMY_TIMESTAMP),
                createdOn: new Date(DUMMY_TIMESTAMP),
              };
            },
          }]]));

        const state = State.buildFor(autoscalerConfig);
        const data = await state.get();

        sinon.assert.calledWith(stubSpannerTable.read, expectedQuery);
        // timestamp was converted...
        assert.equals(data, {
          createdOn: DUMMY_TIMESTAMP,
          lastScalingTimestamp: DUMMY_TIMESTAMP});
      });

  it('get() should create a document when it does not exist',
      async function() {
        // @ts-ignore
        stubSpannerTable.read.returns(Promise.resolve([[]]));

        const state = State.buildFor(autoscalerConfig);
        // make state.now return a fixed value
        const nowfunc = sinon.stub();
        sinon.replaceGetter(state, 'now', nowfunc);
        nowfunc.returns(DUMMY_TIMESTAMP);

        const data = await state.get();

        sinon.assert.calledWith(stubSpannerTable.upsert, {
          id: expectedRowId,
          createdOn: DUMMY_SPANNER_ISO_TIME,
          lastScalingTimestamp: '1970-01-01T00:00:00.000000000Z',
        });

        assert.equals(data, {
          lastScalingTimestamp: 0,
          createdOn: DUMMY_TIMESTAMP,
        });
      });

  it('set() should write document to collection',
      async function() {
        // set calls get(), so give it a doc to return...
        // @ts-ignore
        stubSpannerTable.read.returns(Promise.resolve([[
          {
            toJSON: () => {
              return {
                lastScalingTimestamp: new Date(0),
                createdOn: new Date(0),
              };
            },
          }]]));

        const state = State.buildFor(autoscalerConfig);
        // make state.now return a fixed value
        const nowfunc = sinon.stub();
        sinon.replaceGetter(state, 'now', nowfunc);
        nowfunc.returns(DUMMY_TIMESTAMP);
        await state.set();

        sinon.assert.calledWith(stubSpannerTable.upsert, {
          id: expectedRowId,
          updatedOn: DUMMY_SPANNER_ISO_TIME,
          lastScalingTimestamp: DUMMY_SPANNER_ISO_TIME,
        });
      });
});


