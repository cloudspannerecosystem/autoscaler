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
const spanner = require('@google-cloud/spanner');
const {logger} = require('../../autoscaler-common/logger');
const assertDefined = require('../../autoscaler-common/assertDefined');
const {memoize} = require('lodash');
/**
 * @typedef {import('../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 * @typedef {import('../../autoscaler-common/types').StateDatabaseConfig
 * } StateDatabaseConfig
 */

/**
 * @typedef StateData
 * @property {number?} lastScalingCompleteTimestamp - when the last scaling operation completed.
 * @property {string?} scalingOperationId - the ID of the currently in progress scaling operation.
 * @property {number?} scalingRequestedSize - the requested size of the currently in progress scaling operation.
 * @property {number?} scalingPreviousSize - the size of the cluster before the currently in progress scaling operation started.
 * @property {string?} scalingMethod - the scaling method used to calculate the size for the currently in progress scaling operation.
 * @property {number} lastScalingTimestamp - when the last scaling operation was started.
 * @property {number} createdOn - the timestamp when this record was created
 * @property {number} updatedOn - the timestamp when this record was updated.
 */

/**
 * @typedef ColumnDef
 * @property {string} name
 * @property {string} type
 * @property {boolean=} newSchemaCol a column which has been added to the schema, and if not present, will be ignored.
 */
/**
 * Column type definitions for State.
 * @type {Array<ColumnDef>}
 */
const STATE_KEY_DEFINITIONS = [
  {name: 'lastScalingTimestamp', type: 'timestamp'},
  {name: 'createdOn', type: 'timestamp'},
  {name: 'updatedOn', type: 'timestamp'},
  {name: 'lastScalingCompleteTimestamp', type: 'timestamp'},
  {name: 'scalingOperationId', type: 'string'},
  {name: 'scalingRequestedSize', type: 'number', newSchemaCol: true},
  {name: 'scalingPreviousSize', type: 'number', newSchemaCol: true},
  {name: 'scalingMethod', type: 'string', newSchemaCol: true},
];

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
   * Update state data in storage with the given values
   * @param {StateData} stateData
   */
  async updateState(stateData) {
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
   * Builds a Spanner DatabaseClient from parameters in spanner.stateDatabase
   * @param {string} stateProjectId
   * @param {StateDatabaseConfig} stateDatabase
   * @return {spanner.Database}
   */
  static createSpannerDatabaseClient(stateProjectId, stateDatabase) {
    const spannerClient = new spanner.Spanner({projectId: stateProjectId});
    const instance = spannerClient.instance(
      assertDefined(stateDatabase.instanceId),
    );
    return instance.database(assertDefined(stateDatabase.databaseId));
  }

  /**
   * Builds a Spanner database path - used as the key for memoize
   * @param {string} stateProjectId
   * @param {StateDatabaseConfig} stateDatabase
   * @return {string}
   */
  static getStateDatabasePath(stateProjectId, stateDatabase) {
    return `projects/${stateProjectId}/instances/${stateDatabase.instanceId}/databases/${stateDatabase.databaseId}`;
  }

  /**
   * Memoize createSpannerDatabseClient() so that we only create one Spanner
   * database client for each database ID.
   */
  static getSpannerDatabaseClient = memoize(
    StateSpanner.createSpannerDatabaseClient,
    StateSpanner.getStateDatabasePath,
  );

  /**
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    super(spanner);

    if (!spanner.stateDatabase) {
      throw new Error('stateDatabase is not defined in Spanner config');
    }
    this.stateDatabase = spanner.stateDatabase;

    /** @type {spanner.Database} */
    const databaseClient = StateSpanner.getSpannerDatabaseClient(
      this.stateProjectId,
      this.stateDatabase,
    );
    this.table = databaseClient.table('spannerAutoscaler');
  }

  /** @inheritdoc */
  async init() {
    /** @type {StateData} */
    const data = {
      createdOn: this.now,
      updatedOn: this.now,
      lastScalingTimestamp: 0,
      lastScalingCompleteTimestamp: 0,
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };
    await this.writeToSpanner(StateSpanner.convertToStorage(data, true));
    // Need to return storage-format data which uses Date objects
    return {
      createdOn: new Date(data.createdOn),
      updatedOn: new Date(data.updatedOn),
      lastScalingTimestamp: new Date(0),
      lastScalingCompleteTimestamp: new Date(0),
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };
  }

  /**
   * @param {boolean} includeNewSchemaCol - whether to query the cols in the new schema
   */
  async executeQuery(includeNewSchemaCol) {
    // set up list of columns based on if newSchemaCols should be included.
    const columns = STATE_KEY_DEFINITIONS.filter((c) =>
      includeNewSchemaCol ? true : !c.newSchemaCol,
    ).map((c) => c.name);

    const query = {
      columns: columns,
      keySet: {keys: [{values: [{stringValue: this.getSpannerId()}]}]},
    };

    const [rows] = await this.table.read(query);
    if (rows.length == 0) {
      return StateSpanner.convertFromStorage(await this.init());
    }
    return StateSpanner.convertFromStorage(rows[0].toJSON());
  }

  /** @inheritdoc */
  async get() {
    try {
      try {
        return await this.executeQuery(true);
      } catch (e) {
        const err = /** @type {Error} */ (e);
        if (err.message.toLowerCase().includes('column not found')) {
          logger.error({
            message: `Missing columns in Spanner State database table ${StateSpanner.getStateDatabasePath(this.stateProjectId, this.stateDatabase)}/tables/${this.table.name}: ${err.message}`,
            err: e,
          });
          logger.error({
            message: `Table schema needs updating - retrying with older schema.`,
            err: e,
          });
          return await this.executeQuery(false);
        } else {
          throw e;
        }
      }
    } catch (e) {
      logger.fatal({
        message: `Failed to read from Spanner State storage: ${StateSpanner.getStateDatabasePath(this.stateProjectId, this.stateDatabase)}/tables/${this.table.name}: ${e}`,
        err: e,
      });
      throw e;
    }
  }

  /** @inheritdoc */
  async close() {}

  /**
   * Converts row data from Spanner.timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   * @param {*} rowData spanner data
   * @return {StateData} converted rowData
   */
  static convertFromStorage(rowData) {
    /** @type {{[x:string] : any}} */
    const ret = {};

    const rowDataKeys = Object.keys(rowData);

    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (rowDataKeys.includes(colDef.name)) {
        // copy value
        ret[colDef.name] = rowData[colDef.name];
        if (rowData[colDef.name] instanceof Date) {
          ret[colDef.name] = rowData[colDef.name].getTime();
        }
      } else {
        // value not present in storage
        if (colDef.type === 'timestamp') {
          ret[colDef.name] = 0;
        } else {
          ret[colDef.name] = null;
        }
      }
    }
    return /** @type {StateData} */ (ret);
  }

  /**
   * Convert StateData to a row object only containing defined spanner
   * columns, including converting timestamps.
   *
   * @param {StateData} stateData
   * @param {boolean} includeNewSchemaCol
   * @return {*} Spanner row
   */
  static convertToStorage(stateData, includeNewSchemaCol) {
    /** @type {{[x:string]: any}} */
    const row = {};

    const stateDataKeys = Object.keys(stateData);

    // Only copy values into row that have defined column names.
    // exclude newSchemaCol columns if requested.
    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (
        stateDataKeys.includes(colDef.name) &&
        (includeNewSchemaCol || !colDef.newSchemaCol)
      ) {
        // copy value
        // @ts-ignore
        row[colDef.name] = stateData[colDef.name];

        // convert timestamp
        if (colDef.type === 'timestamp' && row[colDef.name] !== null) {
          // convert millis to ISO timestamp
          row[colDef.name] = new Date(row[colDef.name]).toISOString();
        }
      }
    }
    return row;
  }

  /**
   * Try to write the data to Spanner.
   *
   * @param {StateData} stateData
   * @param {boolean} includeNewSchemaCols
   * @private
   */
  async tryWrite(stateData, includeNewSchemaCols) {
    const row = StateSpanner.convertToStorage(stateData, includeNewSchemaCols);
    // we never want to update createdOn
    delete row.createdOn;
    await this.writeToSpanner(row);
  }

  /**
   * Update state data in storage with the given values
   * @param {StateData} stateData
   */
  async updateState(stateData) {
    stateData.updatedOn = this.now;
    try {
      await this.tryWrite(stateData, true);
    } catch (e) {
      const err = /** @type {Error} */ (e);
      if (err.message.toLowerCase().includes('column not found')) {
        logger.error({
          message: `Missing columns in Spanner State database table ${StateSpanner.getStateDatabasePath(this.stateProjectId, this.stateDatabase)}/tables/${this.table.name}: ${err.message}`,
          err: e,
        });
        logger.error({
          message: `Table schema needs updating - retrying with older schema.`,
          err: e,
        });
        await this.tryWrite(stateData, false);
      } else {
        throw e;
      }
    }
  }

  /**
   * Write the given row to spanner, retrying with the older
   * schema if a column not found error is returned.
   * @param {*} row
   */
  async writeToSpanner(row) {
    try {
      row.id = this.getSpannerId();
      await this.table.upsert(row);
    } catch (e) {
      logger.error({
        msg: `Failed to write to Spanner State storage: ${StateSpanner.getStateDatabasePath(this.stateProjectId, this.stateDatabase)}/tables/${this.table.name}: ${e}`,
        err: e,
      });
      throw e;
    }
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
   * Builds a Firestore client for the given project ID
   * @param {string} stateProjectId
   * @return {firestore.Firestore}
   */
  static createFirestoreClient(stateProjectId) {
    return new firestore.Firestore({projectId: stateProjectId});
  }

  /**
   * Memoize createFirestoreClient() so that we only create one Firestore
   * client for each stateProject
   */
  static getFirestoreClient = memoize(StateFirestore.createFirestoreClient);

  /**
   * @param {AutoscalerSpanner} spanner
   */
  constructor(spanner) {
    super(spanner);
    this.firestore = StateFirestore.getFirestoreClient(this.stateProjectId);
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
   * @param {any} docData
   * @return {StateData} converted docData
   */
  static convertFromStorage(docData) {
    /** @type {{[x:string]: any}} */
    const ret = {};

    const docDataKeys = Object.keys(docData);

    // Copy values into row that are present and are known keys.
    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (docDataKeys.includes(colDef.name)) {
        ret[colDef.name] = docData[colDef.name];
        if (docData[colDef.name] instanceof firestore.Timestamp) {
          ret[colDef.name] = docData[colDef.name].toMillis();
        }
      } else {
        // not present in doc:
        if (colDef.type === 'timestamp') {
          ret[colDef.name] = 0;
        } else {
          ret[colDef.name] = null;
        }
      }
    }
    return /** @type {StateData} */ (ret);
  }

  /**
   * Convert StateData to an object only containing defined
   * columns, including converting timestamps from millis to Firestore.Timestamp
   *
   * @param {*} stateData
   * @return {*}
   */
  static convertToStorage(stateData) {
    /** @type {{[x:string]: any}} */
    const doc = {};

    const stateDataKeys = Object.keys(stateData);

    // Copy values into row that are present and are known keys.
    for (const colDef of STATE_KEY_DEFINITIONS) {
      if (stateDataKeys.includes(colDef.name)) {
        if (colDef.type === 'timestamp') {
          // convert millis to Firestore timestamp
          doc[colDef.name] = firestore.Timestamp.fromMillis(
            stateData[colDef.name],
          );
        } else {
          // copy value
          doc[colDef.name] = stateData[colDef.name];
        }
      }
    }
    // we never want to update createdOn
    delete doc.createdOn;

    return doc;
  }

  /** @inheritdoc */
  async init() {
    const initData = {
      createdOn: firestore.Timestamp.fromMillis(this.now),
      updatedOn: firestore.Timestamp.fromMillis(this.now),
      lastScalingTimestamp: firestore.Timestamp.fromMillis(0),
      lastScalingCompleteTimestamp: firestore.Timestamp.fromMillis(0),
      scalingOperationId: null,
      scalingRequestedSize: null,
      scalingMethod: null,
      scalingPreviousSize: null,
    };

    await this.docRef.set(initData);
    return initData;
  }

  /** @inheritdoc */
  async get() {
    let snapshot = await this.docRef.get(); // returns QueryDocumentSnapshot

    if (!snapshot.exists) {
      // It is possible that an old state doc exists in an old docref path...
      snapshot = assertDefined(await this.checkAndReplaceOldDocRef());
    }

    let data;
    if (!snapshot?.exists) {
      data = await this.init();
    } else {
      data = snapshot.data();
    }

    return StateFirestore.convertFromStorage(data);
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
        await this.docRef.set(assertDefined(snapshot.data()));
        await oldDocRef.delete();
      }
      return snapshot;
    } catch (err) {
      logger.error({
        message: `Failed to migrate docpaths: ${err}`,
        err: err,
      });
    }
    return null;
  }

  /**
   * Update state data in storage with the given values
   * @param {StateData} stateData
   */
  async updateState(stateData) {
    stateData.updatedOn = this.now;

    const doc = StateFirestore.convertToStorage(stateData);

    // we never want to update createdOn
    delete doc.createdOn;

    await this.docRef.update(doc);
  }

  /** @inheritdoc */
  async close() {}
}
