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

/*
 * ESLINT: Ignore max line length errors on lines starting with 'it('
 * (test descriptions)
 */
/* eslint max-len: ["error", { "ignorePattern": "^\\s*it\\(" }] */

// eslint-disable-next-line no-unused-vars
const should = require('should');
const validateConfig = require('../validateConfig');

/**
 * @typedef {import('../../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 */

describe('validateConfig', () => {
  describe('#parseAndValidateConfig', () => {
    it('fails when given an empty config', async () => {
      await validateConfig
        .parseAndValidateConfig('')
        .should.be.rejectedWith(
          new Error(
            'Invalid JSON in Autoscaler configuration:' +
              ' SyntaxError: Unexpected end of JSON input',
          ),
        );
    });
    it('fails when not given an array', async () => {
      await validateConfig
        .parseAndValidateConfig('{}')
        .should.be.rejectedWith(
          new validateConfig.ValidationError(
            'Invalid Autoscaler Configuration parameters:\n' +
              'SpannerConfig must be array',
          ),
        );
    });

    it('fails when given an empty array', async () => {
      await validateConfig
        .parseAndValidateConfig('[]')
        .should.be.rejectedWith(
          new validateConfig.ValidationError(
            'Invalid Autoscaler Configuration parameters:\n' +
              'SpannerConfig must NOT have fewer than 1 items',
          ),
        );
    });
  });
  describe('#validateJsonFile', () => {});
  describe('#validateGkeConfigMapFile', () => {});
});
