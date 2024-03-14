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
const {logger} = require('../../autoscaler-common/logger');
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
   * Build a State object for the given configuration
   *
   * @param {AutoscalerSpanner} spanner
   * @return {State}
   */
  static buildFor(spanner) {
    if (!spanner) {
      throw new Error('spanner should not be null');
    }
    switch (spanner?.stateDatabase?.name) {
      case 'firestore':
        return new StateFirestore(spanner);
      case 'spanner':
        return new StateSpanner(spanner);
      default:
        return new StateFirestore(spanner);
    }
  }

  /**
   * @constructor
   * @protected
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    /** @type {string} */
    this.stateProjectId =
      spanner.stateProjectId != null
        ? spanner.stateProjectId
        : spanner.projectId;
    this.projectId = spanner.projectId;
    this.instanceId = spanner.instanceId;
  }

  /**
   * Initialize value in storage
   * @return {Promise<*>}
   */
  async init() {
    throw new Error('Not implemented');
  }

  /**
   * Get scaling timestamp from storage
   *
   * @return {Promise<StateData>}
   */
  async get() {
    throw new Error('Not implemented');
  }

  /**
   * Update scaling timestamp in storage
   */
  async set() {
    throw new Error('Not implemented');
  }

  /**
   * Close storage
   */
  async close() {
    throw new Error('Not implemented');
  }

  /**
   * Get current timestamp in millis.
   *
   * @return {number};
   */
  get now() {
    return Date.now();
  }

  /**
   * @return {string} full ID for this spanner instance
   */
  getSpannerId() {
    return `projects/${this.projectId}/instances/${this.instanceId}`;
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
class StateSpanner extends State {
  /**
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    super(spanner);

    this.client = new Spanner({projectId: this.stateProjectId});
    if (!spanner.stateDatabase) {
      throw new Error('stateDatabase is not defined in Spanner config');
    }
    this.db = this.client
      .instance(spanner.stateDatabase.instanceId)
      .database(spanner.stateDatabase.databaseId);
    this.table = this.db.table('spannerAutoscaler');
  }

  /** @inheritdoc */
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

  /** @inheritdoc */
  async get() {
    const query = {
      columns: ['lastScalingTimestamp', 'createdOn'],
      keySet: {keys: [{values: [{stringValue: this.getSpannerId()}]}]},
    };
    const [rows] = await this.table.read(query);

    let data;
    if (rows.length == 0) {
      data = await this.init();
    } else {
      data = rows[0].toJSON();
    }
    return this.toMillis(data);
  }

  /** @inheritdoc */
  async set() {
    await this.get(); // make sure doc exists

    const newData = {updatedOn: Spanner.timestamp(this.now)};
    newData.lastScalingTimestamp = Spanner.timestamp(this.now);
    await this.updateState(newData);
  }

  /** @inheritdoc */
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
   * Write state data to database.
   * @param {Object} rowData
   */
  async updateState(rowData) {
    const row = JSON.parse(JSON.stringify(rowData));
    // for Centralized or Distributed projects, rows have a unique key.
    row.id = this.getSpannerId();
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
class StateFirestore extends State {
  /**
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    super(spanner);
    this.firestore = new firestore.Firestore({projectId: this.stateProjectId});
  }

  /**
   * build or return the document reference
   * @return {firestore.DocumentReference}
   */
  get docRef() {
    if (this._docRef == null) {
      this._docRef = this.firestore.doc(
        `spannerAutoscaler/state/${this.getSpannerId()}`,
      );
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

  /** @inheritdoc */
  async init() {
    const initData = {
      lastScalingTimestamp: 0,
      createdOn: firestore.FieldValue.serverTimestamp(),
    };

    await this.docRef.set(initData);
    return initData;
  }

  /** @inheritdoc */
  async get() {
    let snapshot = await this.docRef.get(); // returns QueryDocumentSnapshot

    if (!snapshot.exists) {
      // It is possible that an old state doc exists in an old docref path...
      snapshot = await this.checkAndReplaceOldDocRef();
    }

    let data;
    if (!snapshot?.exists) {
      data = await this.init();
    } else {
      data = snapshot.data();
    }

    return this.toMillis(data);
  }

  /**
   * Due to [issue 213](https://github.com/cloudspannerecosystem/autoscaler/issues/213)
   * the docRef had to be changed, so check for an old doc at the old docref
   * If it exists, copy it to the new docref, delete it and return it.
   */
  async checkAndReplaceOldDocRef() {
    try {
      const oldDocRef = this.firestore.doc(
        `spannerAutoscaler/${this.instanceId}`,
      );
      const snapshot = await oldDocRef.get();
      if (snapshot.exists) {
        logger.info(
          `Migrating firestore doc path from spannerAutoscaler/${
            this.instanceId
          } to spannerAutoscaler/state/${this.getSpannerId()}`,
        );
        await this.docRef.set(snapshot.data());
        await oldDocRef.delete();
      }
      return snapshot;
    } catch (e) {
      logger.error(e, `Failed to migrate docpaths`);
    }
    return null;
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

  /** @inheritdoc */
  async close() {}
}
