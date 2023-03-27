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

  const DEFAULT_CONFIG_LOCATION = '/etc/autoscaler-config/autoscaler-config.yaml';

  pollerCore.log(`Autoscaler Poller job started`, {severity: 'INFO'});

  var configLocation = DEFAULT_CONFIG_LOCATION;

  /*
   * If set, the AUTOSCALER_CONFIG environment variable is used to
   * retrieve the configuration for this instance of the poller.
   * Please refer to the documentation in the README.md for GKE
   * deployment for more details.
   */

  if (process.env.AUTOSCALER_CONFIG) {
    configLocation = process.env.AUTOSCALER_CONFIG;
    pollerCore.log(`Using custom config location ${configLocation}`);
  } else {
    pollerCore.log(`Using default config location ${configLocation}`);
  }

  try {
    const data = await fs.readFile(configLocation, { encoding: 'utf8' });
    await pollerCore.checkSpannerScaleMetricsJSON(JSON.stringify(yaml.load(data)))
  } catch (err) {
    pollerCore.log('Error in Poller wrapper:', {severity: 'ERROR', payload: err});
  }
}

main();
