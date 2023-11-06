/* Copyright 2022 Google LLC
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

const express    = require('express')
const scalerCore = require('scaler-core');

function main() {

  scalerCore.log(`Autoscaler Scaler started`, {severity: 'INFO'});

  const app  = express();
  const port = process.env.PORT || 3000;

  app.use(express.json());

  try {
    app.get('/', (req, res) => {
      res.sendStatus(200);
    });

    app.post('/metrics', (req, res) => {
      scalerCore.scaleSpannerInstanceJSON(req, res);
    });

    app.listen(port);
  } catch (err) {
    scalerCore.log('Error in Scaler wrapper:', {severity: 'ERROR', payload: err});
  }
}

main();
