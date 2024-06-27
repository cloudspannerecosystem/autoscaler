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

const {pino} = require('pino');
const process = require('node:process');
const packageJson = require('../../package.json');
const {EventId} = require('eventid');

// JavaScript date has a very coarse granularity (millisecond), which makes
// it quite likely that multiple log entries would have the same timestamp.
// The Logging API doesn't guarantee to preserve insertion order for entries
// with the same timestamp. The service does use `insertId` as a secondary
// ordering for entries with the same timestamp. `insertId` needs to be
// globally unique (within the project) however.
//
// We use a globally unique monotonically increasing EventId as the
// insertId.
// @see https://github.com/googleapis/nodejs-logging/blob/main/src/entry.ts#L198
const eventId = new EventId();

/**
 * Convert Pino log level to GCP log level
 *
 * @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
 * @type {Map<pino.Level,string>}
 */
const PinoLevelToGcpSeverity = new Map([
  ['trace', 'DEBUG'],
  ['debug', 'DEBUG'],
  ['info', 'INFO'],
  ['warn', 'WARNING'],
  ['error', 'ERROR'],
  ['fatal', 'CRITICAL'],
]);

const serviceContext = {
  service: packageJson.name,
  version: packageJson.version,
};

/** @type {pino.Level} */
const DEFAULT_LOG_LEVEL = 'debug';
/** @type {pino.Level} */
const DEFAULT_TEST_LOG_LEVEL = 'fatal';

/**
 * Return a pino log level based on environment variable LOG_LEVEL which can be
 * either a GCP or a pino log level.
 *
 * If not defined, use DEBUG normally, or CRITICAL/fatal in NODE_ENV=test mode
 *
 * @return {pino.Level}
 */
function getLogLevel() {
  const envLogLevel = process.env.LOG_LEVEL
    ? process.env.LOG_LEVEL.toLowerCase()
    : null;

  // Convert the env varable to the pino level, or undefined.
  const pinoLevel =
    envLogLevel != null
      ? [...PinoLevelToGcpSeverity.entries()].filter(
          (e) =>
            e[0].toLowerCase() === envLogLevel ||
            e[1].toLowerCase() === envLogLevel,
        )[0]?.[0]
      : undefined;

  if (pinoLevel) {
    return pinoLevel;
  } else if (process.env.NODE_ENV?.toLowerCase() === 'test') {
    return DEFAULT_TEST_LOG_LEVEL;
  } else {
    return DEFAULT_LOG_LEVEL;
  }
}

/**
 * Convert pino log level to Google severity
 * @param {string} label
 * @param {number} number
 * @return {Object}
 */
function pinoLevelToGcpSeverity(label, number) {
  const pinoLevel = /** @type {pino.Level} */ (label);
  const gcpLevel = PinoLevelToGcpSeverity.get(pinoLevel) ?? 'DEBUG';
  return {
    severity: gcpLevel,
    level: number,
    //    ...errorTypeProperty,
  };
}

/**
 * Create a JSON fragment string containing the timestamp in Stackdriver format:
 * <pre>
 * "timestamp": {
 *   "seconds": nnnnn,
 *   "nanos": nnnnn
 * }`
 * </pre>
 * @return {string}
 */
function getGcpLoggingTimestamp() {
  const millis = Date.now();
  return `,"timestamp":{"seconds":${Math.floor(millis / 1000)},"nanos": ${millis % 1000}000000}`;
}

/**
 * Add stack traces. insertId and serviceContext to logging
 *
 * @param {Record<string,unknown>} entry
 * @return {Record<string,unknown>}
 */
function formatLogObject(entry) {
  if (entry.err instanceof Error && entry.err.stack) {
    entry.stack_trace = entry.err.stack;
  }
  entry.serviceContext = serviceContext;
  // Sequential insertId
  entry['logging.googleapis.com/insertId'] = eventId.new();
  return entry;
}

/**
 * Config object for Pino.
 *
 * @type {pino.LoggerOptions}
 */
const pinoConfig = {
  level: getLogLevel(),
  // Use 'message' instead of 'msg' as error message key.
  messageKey: 'message',
  formatters: {
    level: pinoLevelToGcpSeverity,
    log: formatLogObject,
  },
  timestamp: getGcpLoggingTimestamp,
};

module.exports = {
  logger: pino(pinoConfig),
};
