// Copyright 2023 Google LLC
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
 * Create a Bunyan Logger using structured logging to stdout.
 */
const bunyan = require('bunyan');
const {LoggingBunyan} = require('@google-cloud/logging-bunyan');

/**
 * Return a bunyan level based on environment variables (or lack thereof).
 *
 * @return {bunyan.LogLevel}
 */
function getLogLevel() {
  if (process.env.LOG_LEVEL) {
    return bunyan.levelFromName[process.env.LOG_LEVEL.toLowerCase()];
  } else if (process.env.NODE_ENV?.toLowerCase() === 'test') {
    return bunyan.FATAL;
  } else {
    return bunyan.DEBUG;
  }
}

// Create logging client.
const loggingBunyan = new LoggingBunyan({
  redirectToStdout: true,
  projectId: process.env.PROJECT_ID,
  logName: 'autoscaler',
  useMessageField: false,
});

const logger = bunyan.createLogger({
  name: 'cloud-spanner-autoscaler',
  streams: [
    loggingBunyan.stream(getLogLevel()),
  ],
});

module.exports = {
  logger: logger,
};
