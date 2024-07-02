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

/**
 * Error thrown when validation fails.
 */
class ValidationError extends Error {
  /**
   * @param {string} errors Human readable string with all errors listed.
   */
  constructor(errors) {
    super(errors);
  }
}

/**
 * Encapsulates the Ajv validator initialzation and checks.
 */
class ConfigValidator {
  /** Creates the class launches async initialization. */
  constructor() {
    /** @type {ValidateFunction} */
    this.ajvConfigValidator;

    /** @type {Ajv} */
    this.ajv;

    this.pendingInit = this.initAsync();
  }

  /**
   * Performs asynchronous initialization.
   *
   * @return {Promise<void>}
   */
  async initAsync() {
    const tmpAjv = new Ajv({allErrors: true});

    const configSchema = await fs.readFile(
      'autoscaler-config.schema.json',
      'utf-8',
    );

    const schema = JSON.parse(configSchema);
    this.ajvConfigValidator = tmpAjv.compile(schema);
    this.ajv = tmpAjv;
  }

  /**
   * Validates the given object against the Spanner Autoscaler Config schema.
   *
   * @param {AutoscalerSpanner[]} clusters
   */
  async assertValidConfig(clusters) {
    await this.pendingInit;
    const valid = this.ajvConfigValidator(clusters);
    if (!valid) {
      throw new ValidationError(
        'Invalid Autoscaler Configuration parameters:\n' +
          this.ajv.errorsText(this.ajvConfigValidator.errors, {
            separator: '\n',
            dataVar: 'SpannerConfig',
          }),
      );
    }
  }

  /**
   * Parses the given string as JSON and validate it against the SannerConfig
   * schema. Throws an Error if the config is not valid.
   *
   * @param {string} jsonString
   * @return {Promise<AutoscalerSpanner[]>}
   */
  async parseAndAssertValidConfig(jsonString) {
    let configJson;
    try {
      configJson = JSON.parse(jsonString);
    } catch (e) {
      throw new Error(`Invalid JSON in Autoscaler configuration: ${e}`);
    }
    await this.assertValidConfig(configJson);
    return configJson;
  }
}

/**
 * Validates the specified Spanner Autoscaler JSON configuration file.
 * Throws an Error and reports to console if the config is not valid.
 *
 * @param {ConfigValidator} configValidator
 * @param {string} filename
 */
async function assertValidJsonFile(configValidator, filename) {
  try {
    const configText = await fs.readFile(filename, 'utf-8');
    await configValidator.parseAndAssertValidConfig(configText);
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(
        `Validation of config in file ${filename} failed:\n${e.message}`,
      );
    } else {
      console.error(`Processing of config in file ${filename} failed: ${e}`);
    }
    throw new Error(`${filename} Failed validation`);
  }
}

/**
 * Validates all the Spanner Autoscaler YAML config files specified in the
 * GKE configMap. Throws an Error and reports
 * to console if any of the configmaps do not pass validation.
 *
 * @param {ConfigValidator} configValidator
 * @param {string} filename
 */
async function assertValidGkeConfigMapFile(configValidator, filename) {
  let configMap;

  try {
    const configText = await fs.readFile(filename, 'utf-8');
    configMap = /** @type {any} */ (yaml.load(configText));
  } catch (e) {
    console.error(`Could not parse YAML from ${filename}: ${e}`);
    throw e;
  }

  if (configMap.kind !== 'ConfigMap') {
    console.error(`${filename} is not a GKE ConfigMap`);
    throw new Error(`${filename} is not a GKE ConfigMap`);
  }

  let success = true;
  for (const configMapFile of Object.keys(configMap.data)) {
    const configMapData = configMap.data[configMapFile];
    try {
      const spannerConfig = yaml.load(configMapData);
      await configValidator.parseAndAssertValidConfig(
        JSON.stringify(spannerConfig),
      );
    } catch (e) {
      if (e instanceof ValidationError) {
        console.error(
          `Validation of configMap entry data.${configMapFile} in file ${filename} failed:\n${e.message}`,
        );
      } else if (e instanceof yaml.YAMLException) {
        console.error(
          `Could not parse YAML from value data.${configMapFile} in ${filename}: ${e}`,
        );
      } else {
        console.error(
          `Processing of configMap entry data.${configMapFile} in file ${filename} failed: ${e}`,
        );
      }
      success = false;
    }
  }
  if (!success) {
    throw new Error(`${filename} Failed validation`);
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
    console.log('Usage: validate-config-file CONFIG_FILE_NAME');
    console.log(
      'Validates that the specified Autoscaler JSON config is defined correctly',
    );
    process.exit(1);
  }

  const configValidator = new ConfigValidator();

  if (process.argv[1].toLowerCase().endsWith('.yaml')) {
    assertValidGkeConfigMapFile(configValidator, process.argv[1]).then(
      () => process.exit(0),
      (e) => {
        console.error(e);
        process.exit(1);
      },
    );
  } else if (process.argv[1].toLowerCase().endsWith('.json')) {
    assertValidJsonFile(configValidator, process.argv[1]).then(
      () => process.exit(0),
      (e) => {
        console.error(e);
        process.exit(1);
      },
    );
  } else {
    console.log(
      `filename ${process.argv[1]} must either be JSON (.json) or a YAML configmap (.yaml) file`,
    );
    process.exit(1);
  }
}

module.exports = {
  ConfigValidator,
  ValidationError,
  main,
  TEST_ONLY: {
    assertValidGkeConfigMapFile,
    assertValidJsonFile,
  },
};
