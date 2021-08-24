/* Copyright 2021 Google LLC
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
 * Helper class for various spanner size related calculations 
 *
 * The input parameters include information about a Spanner instance and
 * they are sent by the poller function.
 */

class SizeHelper {
  constructor(spannerParameters) {
    this.units = (this._units == 'NODES')? "nodes": "processing units";
    this.min = new Parameter(spannerParameters.minSize, this.units)
    this.max = new Parameter(spannerParameters.maxSize, this.units);
    this.step = new Parameter(spannerParameters.stepSize, this.units);
    this.overloadStep = new Parameter(spannerParameters.overloadStepSize, this.units);
    this.current = new Parameter(spannerParameters.units == 'NODES'? spannerParameters.currentNodes : spannerParameters.currentProcessingUnits, this.units);
  }
}

class Parameter {
  constructor(value, units) {
    this._value = value;
    this._units = units;
  }

  toString() {
    return `${this._value} ${this._units}`;
  }

  valueOf() {
    return this._value;
  }
}

module.exports = SizeHelper;
