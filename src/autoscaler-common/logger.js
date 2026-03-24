// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Create a Pino Logger using structured logging to stdout.
 */

const pino = require('pino');
const process = require('node:process');
const packageJson = require('../../package.json');
const {
  createGcpLoggingPinoConfig,
} = require('@google-cloud/pino-logging-gcp-config');

const DEFAULT_LOG_LEVEL = 'debug';
const DEFAULT_TEST_LOG_LEVEL = 'fatal';

/**
 * Return a pino log level based on environment variable LOG_LEVEL which can be
 * either a GCP or a pino log level.
 *
 * If not defined, use DEBUG normally, or CRITICAL/fatal in NODE_ENV=test mode
 *
 * @return {string}
 */
function getLogLevel() {
  const envLogLevel = process.env.LOG_LEVEL
    ? process.env.LOG_LEVEL.toLowerCase()
    : null;

  if (envLogLevel) {
    return envLogLevel;
  } else if (process.env.NODE_ENV?.toLowerCase() === 'test') {
    return DEFAULT_TEST_LOG_LEVEL;
  } else {
    return DEFAULT_LOG_LEVEL;
  }
}

module.exports = {
  logger: pino.pino(
    createGcpLoggingPinoConfig(
      {
        serviceContext: {
          service: packageJson.name,
          version: packageJson.version,
        },
      },
      {
        level: getLogLevel(),
      },
    ),
  ),
};
