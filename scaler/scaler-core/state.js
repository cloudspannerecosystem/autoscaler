/* Copyright 2020 Google LLC
 *
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

const {Firestore} = require('@google-cloud/firestore');
const {Spanner} = require('@google-cloud/spanner');

class State {
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

  async init() {
    return await this.state.init();
  }

  async get() {
    return await this.state.get();
  }

  async set() {
    await this.state.set();
  }

  async close() {
    await this.state.close();
  }

  get now() {
    return this.state.now;
  }
}
module.exports = State;

/*
 * Manages the Autoscaler persistent state in spanner.
 * 
 * To manage the Autoscaler state in a spanner database,
 * set the `stateDatabase.name` parameter to 'spanner' in the Cloud Scheduler configuration.
 * The following is an example.
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
  constructor(spanner) {
    this.stateProjectId = (spanner.stateProjectId != null) ? spanner.stateProjectId :
                                                        spanner.projectId;
    this.projectId = spanner.projectId;
    this.instanceId = spanner.instanceId;

    this.client = new Spanner({projectId: this.stateProjectId});
    this.db = this.client.instance(spanner.stateDatabase.instanceId).database(spanner.stateDatabase.databaseId)
    this.table = this.db.table('spannerAutoscaler');
  }

  async init() {
    var initData = {
      lastScalingTimestamp: Spanner.timestamp(new Date(0)),
      createdOn: Spanner.timestamp(Date.now()),
    };
    await this.updateState(initData);
    return initData;
  }

  async get() {
    const query = {
      columns: ['lastScalingTimestamp', 'createdOn'],
      keySet: {
        keys: [{values: [{stringValue: this.rowId()}]}]
      }
    }
    const [rows] = await this.table.read(query)
    if (rows.length == 0) {
      this.data = await this.init();
    } else {
      this.data = rows[0].toJSON();
    }
    return this.toMillis(this.data);
  }

  async set() {
    await this.get();  // make sure doc exists

    var newData = {
      updatedOn: Spanner.timestamp(Date.now())
    };
    newData.lastScalingTimestamp = Spanner.timestamp(Date.now());
    await this.updateState(newData);
  }

  async close() {
    await this.db.close();
  }

  /**
   * Converts row data from Spanner.timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   */
  toMillis(rowData) {
    Object.keys(rowData).forEach(key => {
      if (rowData[key] instanceof Date) {
          rowData[key] = rowData[key].getTime();
      }
    })
    return rowData;
  }

  get now() {
    return Date.now();
  }

  rowId() {
    return `projects/${this.projectId}/instances/${this.instanceId}`;
  }

  async updateState(rowData) {
    const row = JSON.parse(JSON.stringify(rowData));
    // for Centralized or Distributed projects, rows have a unique key.
    row.id = this.rowId();
    // converts TIMESTAMP type columns to ISO format string for registration
    Object.keys(row).forEach(key => {
      if (row[key] instanceof Date) {
        row[key] = row[key].toISOString();
      }
    });
    await this.table.upsert(row);
  }
}

/*
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
  constructor(spanner) {
    this.projectId = (spanner.stateProjectId != null) ? spanner.stateProjectId :
                                                        spanner.projectId;
    this.instanceId = spanner.instanceId;
    this.firestore = new Firestore({projectId: this.projectId})
  }

  get docRef() {
    if (this._docRef == null) {
      this.firestore = new Firestore({projectId: this.projectId});
      this._docRef =
          this.firestore.collection('spannerAutoscaler').doc(this.instanceId);
    }
    return this._docRef;
  }

  /**
   * Converts document data from Firestore.Timestamp (implementation detail)
   * to standard JS timestamps, which are number of milliseconds since Epoch
   * https://googleapis.dev/nodejs/firestore/latest/Timestamp.html
   */
  toMillis(docData) {
    Object.keys(docData).forEach(key => {
      if (docData[key] instanceof Firestore.Timestamp) {
        docData[key] = docData[key].toMillis();
      }
    });
    return docData;
  }

  async init() {
    var initData = {
      lastScalingTimestamp: 0,
      createdOn: Firestore.FieldValue.serverTimestamp()
    };

    await this.docRef.set(initData);
    return initData;
  }

  async get() {
    var snapshot = await this.docRef.get();  // returns QueryDocumentSnapshot

    if (!snapshot.exists) {
      this.data = await this.init();
    } else {
      this.data = snapshot.data();
    }

    return this.toMillis(this.data);
  }

  async set() {
    await this.get();  // make sure doc exists

    var newData = {updatedOn: Firestore.FieldValue.serverTimestamp()};
    newData.lastScalingTimestamp = Firestore.FieldValue.serverTimestamp();

    await this.docRef.update(newData);
  }

  async close() {

  }

  get now() {
    return Firestore.Timestamp.now().toMillis();
  }
}
