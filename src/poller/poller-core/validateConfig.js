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
 * @fileoverview Validates a given configuration against the JSON schema
 */

const Ajv = require('ajv').default;
const fs = require('fs/promises');
const yaml = require('js-yaml');

/**
 * @typedef {import('../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 *
 * @typedef {import('ajv').ValidateFunction} ValidateFunction
 */

/** @type {ValidateFunction} */
let ajvConfigValidator;

/** @type {Ajv} */
let ajv;

/**
 * Initialize AJV and load the schema.
 *
 * @return {Promise<Void>}
 */
async function init() {
  if (ajv) {
    return;
  }
  ajv = new Ajv({allErrors: true});

  const configSchema = await fs.readFile(
    'autoscaler-config.schema.json',
    'utf-8',
  );

  const schema = JSON.parse(configSchema);
  ajvConfigValidator = ajv.compile(schema);
}

/**
 * Error thrown when validation fails.
 */
class ValidationError extends Error {
  /**
   * @param {string} errors
   */
  constructor(errors) {
    super(errors);
  }
}

/**
 * Validates the given object against the Spanner Config schema
 *
 * @param {AutoscalerSpanner[]} spanners
 */
async function validateConfig(spanners) {
  await init();
  const valid = ajvConfigValidator(spanners);
  if (!valid) {
    throw new ValidationError(
      'Invalid Autoscaler Configuration parameters:\n' +
        ajv.errorsText(ajvConfigValidator.errors, {
          separator: '\n',
          dataVar: 'SpannerConfig',
        }),
    );
  }
}

/**
 *
 * Parse the given string as JSON and validate it against the SannerConfig
 * schema
 *
 * @param {string} jsonString
 * @return {Promise<AutoscalerSpanner[]>}
 */
async function parseAndValidateConfig(jsonString) {
  let configJson;
  try {
    configJson = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`Invalid JSON in Autoscaler configuration: ${e}`);
  }
  await validateConfig(configJson);
  return configJson;
}

/**
 * Validates the specified Spanner Autoscaler JSON configuration file.
 *
 * @param {string} filename
 */
async function validateJsonFile(filename) {
  await init();

  try {
    const configText = await fs.readFile(filename, 'utf-8');
    await parseAndValidateConfig(configText);
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(`Validation of config in file ${filename} failed:`);
      console.error(e.message);
    } else {
      console.error(`Processing of config in file ${filename} failed: ${e}`);
    }
    throw e;
  }
}

/**
 * Validates all the Spanner Autoscaler YAML config files specified in the
 * GKE configMap
 *
 * @param {string} filename
 */
async function validateGkeConfigMapFile(filename) {
  await init();

  /** @type {any} */
  let configMap;

  try {
    const configText = await fs.readFile(filename, 'utf-8');
    configMap = yaml.load(configText);
    if (configMap.kind !== 'ConfigMap') {
      console.error(`${filename} is not a GKE ConfigMap`);
      throw new Error('File is not a GKE ConfigMap');
    }
  } catch (e) {
    console.error(`Could not parse YAML from ${filename}: ${e}`);
    throw e;
  }

  // Iterate through configmap files items in data, checking each one.
  let success = true;
  for (const configMapFile of Object.keys(configMap.data)) {
    const configMapData = configMap.data[configMapFile];
    try {
      const spannerConfig = yaml.load(configMapData);
      try {
        await parseAndValidateConfig(JSON.stringify(spannerConfig));
      } catch (e) {
        if (e instanceof ValidationError) {
          console.error(
            `Validation of configMap entry data.${configMapFile} in file ${filename} failed:`,
          );
          console.error(e.message);
        } else {
          console.error(
            `Processing of configMap entry data.${configMapFile} in file ${filename} failed: ${e}`,
          );
        }
        success = false;
      }
    } catch (e) {
      console.error(
        `Could not parse YAML from value data.${configMapFile} in ${filename}: ${e}`,
      );
      success = false;
    }
  }
  if (!success) {
    throw new Error('Failed validation');
  }
}

/**
 * Validates a configuration file passed in on the command line.
 */
function main() {
  if (
    process.argv.length <= 1 ||
    process.argv[1] === '-h' ||
    process.argv[1] === '--help'
  ) {
    console.log('Usage: validateConfigFile CONFIG_FILE_NAME');
    console.log(
      'Validates that the specified Autoscaler JSON config is defined correctly',
    );
    process.exit(1);
  }

  if (process.argv[1].endsWith('.yaml')) {
    validateGkeConfigMapFile(process.argv[1]).then(
      () => process.exit(0),
      () => process.exit(1),
    );
  } else if (process.argv[1].endsWith('.json')) {
    validateJsonFile(process.argv[1]).then(
      () => process.exit(0),
      () => process.exit(1),
    );
  } else {
    console.log(
      `filename ${process.argv[1]} must either be a JSON or YAML configmap file`,
    );
    process.exit(1);
  }
}

module.exports = {
  parseAndValidateConfig,
  main,
  ValidationError,
  TEST_ONLY: {
    validateGkeConfigMapFile,
    validateJsonFile,
  },
};
