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
const should = require('should');

const app = rewire('../index.js');

const getNewMetadata = app.__get__('getNewMetadata');
describe('#getNewMetadata', () => {
    it('should return an object with the nodeCount property set', () => {
      getNewMetadata(99,'NODES').should.have.property('nodeCount').which.is.a.Number().and.equal(99);
    });

    it('should return an object with the processingUnits property set', () => {
      getNewMetadata(88,'PROCESSING_UNITS').should.have.property('processingUnits').which.is.a.Number().and.equal(88);
    });
});