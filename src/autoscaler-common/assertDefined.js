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

/**
 * Asserts that given value is not null or undefined
 *
 * @template T
 * @param {T|null|undefined} value
 * @param {string} [valueName='']
 * @return {!T}
 */
function assertDefined(value, valueName = '') {
  if (value == null) {
    throw new Error(
      `Fatal error: value ${valueName} must not be null/undefined.`,
    );
  }
  return value;
}

module.exports = assertDefined;
