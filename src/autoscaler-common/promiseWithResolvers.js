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

/** @typedef {{
 *   promise: Promise<any>;
 *   resolve: (value: any) => void;
 *   reject: (reason: any) => void;
 * }} PromiseWithResolvers */

/**
 * Node version of ECMA262's Promise.withResolvers()
 * @see https://tc39.es/proposal-promise-with-resolvers/#sec-promise.withResolvers
 *
 * @return {PromiseWithResolvers}
 */
function promiseWithResolvers() {
  /** @type { (value: any) => void} */
  let resolve;
  /** @type { (reason: any) => void} */
  let reject;
  const promise = new Promise(function (res, rej) {
    resolve = res;
    reject = rej;
  });
  // @ts-ignore used-before-assigned
  return {promise, resolve, reject};
}

module.exports = {
  create: promiseWithResolvers,
};
