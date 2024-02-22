/**
 * Copyright 2023 Google LLC
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
 * limitations under the License.
 */

/*
 * Manages the Autoscaler persistent state
 *
 * By default, this implementation uses a Firestore instance in the same
 * project as the Spanner instance. To use a different project, set the
 * `stateProjectId` parameter in the Cloud Scheduler configuration.
 *
 * To use another database to save autoscaler state, set the
 * `stateDatabase.name` parameter in the Cloud Scheduler configuration.
 * The default database is Firestore.
 */

const firestore = require('@google-cloud/firestore');
const {Spanner} = require('@google-cloud/spanner');
/**
 * @typedef {import('../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 */

/**
 * @typedef {{
*  lastScalingTimestamp: number
*  createdOn: number
* }} StateData
*/


/**
 * Used to store state of a Spanner instance
 */
class State {
  /**
   * @constructor
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    switch (spanner.stateDatabase && spanner.stateDatabase.name) {
      case 'firestore':
        this.state = new StateFirestore(spanner);
        break;
      case 'spanner':
        this.state = new StateSpanner(spanner);
        break;
      default:
        this.state = new StateFirestore(spanner);
        break;
    }
  }

  /**
   * proxy init to underlying state implementation
   */
  async init() {
    return await this.state.init();
  }

  /**
   * Get scaling timestamp in storage from undelying state implementation
   *
   * @return {Promise<StateData>}
   */
  async get() {
    return await this.state.get();
  }

  /**
   * Update scaling timestamp in storage from undelying state implementation
   */
  async set() {
    await this.state.set();
  }

  /**
   * Close underlying state implementation
   */
  async close() {
    await this.state.close();
  }

  /**
   * proxy now() to underlying state implementation
   */
  get now() {
    return this.state.now;
  }
}

module.exports = State;

/**
 * Manages the Autoscaler persistent state in spanner.
 *
 * To manage the Autoscaler state in a spanner database,
 * set the `stateDatabase.name` parameter to 'spanner' in the Cloud Scheduler
 * configuration. The following is an example.
 *
 * {
 *   "stateDatabase": {
 *       "name":       "spanner",
 *       "instanceId": "autoscale-test", // your instance id
 *       "databaseId": "my-database"     // your database id
 *   }
 * }
 */
class StateSpanner {
  /**
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    this.stateProjectId = (spanner.stateProjectId != null) ?
        spanner.stateProjectId :
        spanner.projectId;
    this.projectId = spanner.projectId;
    this.instanceId = spanner.instanceId;

    this.client = new Spanner({projectId: this.stateProjectId});
    if (!spanner.stateDatabase) {
      throw new Error('stateDatabase is not defined in Spanner config');
    }
    this.db = this.client.instance(spanner.stateDatabase.instanceId)
        .database(spanner.stateDatabase.databaseId);
    this.table = this.db.table('spannerAutoscaler');
  }

  /**
   * Initialize state
   * @return {Promise<*>}
   */
  async init() {
    const initData = {
      // Spanner.timestamp(0) is the same as Spanner.timestamp(null), returns
      // now - so use the string value of the epoch.
      lastScalingTimestamp: Spanner.timestamp('1970-01-01T00:00:00Z'),
      createdOn: Spanner.timestamp(this.now),
    };
    await this.updateState(initData);
    return initData;
  }

  /**
   * @return {Promise<StateData>} lastScalingTimestamp from storage
   */
  async get() {
    const query = {
      columns: ['lastScalingTimestamp', 'createdOn'],
      keySet: {keys: [{values: [{stringValue: this.rowId()}]}]},
    };
    const [rows] = await this.table.read(query);
    if (rows.length == 0) {
      this.data = await this.init();
    } else {
      this.data = rows[0].toJSON();
    }
    return this.toMillis(this.data);
  }

  /**
   * Update scaling timestamp in storage
   */
  async set() {
    await this.get(); // make sure doc exists

    const newData = {updatedOn: Spanner.timestamp(this.now)};
    newData.lastScalingTimestamp = Spanner.timestamp(this.now);
    await this.updateState(newData);
  }

  /**
   * Close DB connection
   */
  async close() {
    await this.db.close();
  }

  /**
   * Converts row data from Spanner.timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   * @param {Object} rowData spanner data
   * @return {StateData} converted rowData
   */
  toMillis(rowData) {
    Object.keys(rowData).forEach((key) => {
      if (rowData[key] instanceof Date) {
        rowData[key] = rowData[key].getTime();
      }
    });
    return rowData;
  }

  /**
   * @return {number} current timestamp
   */
  get now() {
    return Date.now();
  }

  /**
   * @return {string} row ID for this instance
   */
  rowId() {
    return `projects/${this.projectId}/instances/${this.instanceId}`;
  }

  /**
   * Write state data to database.
   * @param {Object} rowData
   */
  async updateState(rowData) {
    const row = JSON.parse(JSON.stringify(rowData));
    // for Centralized or Distributed projects, rows have a unique key.
    row.id = this.rowId();
    // converts TIMESTAMP type columns to ISO format string for registration
    Object.keys(row).forEach((key) => {
      if (row[key] instanceof Date) {
        row[key] = row[key].toISOString();
      }
    });
    await this.table.upsert(row);
  }
}

/**
 * Manages the Autoscaler persistent state in firestore.
 *
 * The default database for state management is firestore.
 * It is also possible to manage with firestore
 * by explicitly setting `stateDatabase.name` to 'firestore'.
 * The following is an example.
 *
 * {
 *   "stateDatabase": {
 *       "name": "firestore"
 *   }
 * }
 */
class StateFirestore {
  /**
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    this.projectId = (spanner.stateProjectId != null) ? spanner.stateProjectId :
                                                        spanner.projectId;
    this.instanceId = spanner.instanceId;
    this.firestore = new firestore.Firestore({projectId: this.projectId});
  }

  /**
   * build or return the document reference
   * @return {firestore.DocumentReference}
   */
  get docRef() {
    if (this._docRef == null) {
      this.firestore = new firestore.Firestore({projectId: this.projectId});
      this._docRef =
          this.firestore.collection('spannerAutoscaler').doc(this.instanceId);
    }
    return this._docRef;
  }

  /**
   * Converts document data from Firestore.Timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   * https://googleapis.dev/nodejs/firestore/latest/Timestamp.html
   * @param {Object} docData
   * @return {StateData} converted docData
   */
  toMillis(docData) {
    Object.keys(docData).forEach((key) => {
      if (docData[key] instanceof firestore.Timestamp) {
        docData[key] = docData[key].toMillis();
      }
    });
    return docData;
  }

  /**
   * Initialize state
   * @return {Promise<Object>}
   */
  async init() {
    const initData = {
      lastScalingTimestamp: 0,
      createdOn: firestore.FieldValue.serverTimestamp(),
    };

    await this.docRef.set(initData);
    return initData;
  }

  /**
   * @return {Promise<StateData>} scaling timstamps from storage
   */
  async get() {
    const snapshot = await this.docRef.get(); // returns QueryDocumentSnapshot

    if (!snapshot.exists) {
      this.data = await this.init();
    } else {
      this.data = snapshot.data();
    }

    return this.toMillis(this.data);
  }

  /**
   * Update scaling timestamp in storage
   */
  async set() {
    await this.get(); // make sure doc exists

    const newData = {updatedOn: firestore.FieldValue.serverTimestamp()};
    newData.lastScalingTimestamp = firestore.FieldValue.serverTimestamp();

    await this.docRef.update(newData);
  }

  /**
   * Close DB connection
   */
  async close() {}

  /**
   * @return {number} current timestamp
   */
  get now() {
    return firestore.Timestamp.now().toMillis();
  }
}
