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
 * Direct scaling method
 *
 * Suggests scaling to the number of nodes specified by maxNodes.
 * Useful to scale an instance in preparation for a batch job,
 * and and to scale it back after the job is finished.
 */
const {log} = require('../utils.js');

exports.calculateNumNodes = (spanner) => {
  log(`---- DIRECT node suggestions for ${spanner.projectId}/${spanner.instanceId}----`);
  log(`	Final DIRECT suggestion: ${spanner.maxNodes} nodes`);
  return spanner.maxNodes;
}
