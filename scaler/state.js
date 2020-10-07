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
 * `stateProjectId` parameter in the Cloud Scheduler configuration
 */

const {Firestore} = require('@google-cloud/firestore');

class State {
  constructor(spanner) {
    this.projectId = (spanner.stateProjectId != null) ? spanner.stateProjectId :
                                                        spanner.projectId;
    this.instanceId = spanner.instanceId;
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
   * https://googleapis.dev/nodejs/firestore/latest/Timestamp.htmlr
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

  get now() {
    return Firestore.Timestamp.now().toMillis();
  }
}

module.exports = State;
