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

const pollerCore = require('poller-core');
const yaml       = require('js-yaml');
const fs         = require('fs/promises');

async function main() {

  pollerCore.log(`Autoscaler Poller job started`, 'INFO');

  try {
    const data = await fs.readFile('/etc/autoscaler-config.yaml', { encoding: 'utf8' });
    await pollerCore.checkSpannerScaleMetricsJSON(JSON.stringify(yaml.load(data)))
  } catch (err) {
    pollerCore.log(err);
  }
}

main();
