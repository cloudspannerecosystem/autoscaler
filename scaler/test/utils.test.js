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

const app = rewire('../utils.js');

const maybeRound = app.__get__('maybeRound');
describe('#maybeRound', () => {
    it('should not round when using NODES as units', () => {
        maybeRound(7, 'NODES').should.equal(7);
    });

    it('should round to nearest 100 processing units when suggestion < 1000 PU', () => {
        maybeRound(567, 'PROCESSING_UNITS').should.equal(600);
    });

    it('should round to nearest 1000 processing units when suggestion > 1000 PU', () => {
        maybeRound(1001, 'PROCESSING_UNITS').should.equal(2000);
    });

});