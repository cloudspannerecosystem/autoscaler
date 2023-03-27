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
 * Helper functions
 *
 */

function log(message, {severity = 'DEBUG', projectId, instanceId, payload} = {} ) {
  // Structured logging
  // https://cloud.google.com/functions/docs/monitoring/logging#writing_structured_logs

  if (!!payload) {
    // If payload is an Error, get the stack trace.
    if (payload instanceof Error && !!payload.stack) {
      if (!!message ) {
         message = message + '\n' + payload.stack;
      } else {
         message = payload.stack;
      }
    }
  }

  const logEntry = {
    message: message,
    severity: severity,
    projectId: projectId,
    instanceId: instanceId,
    payload: payload
  };
  console.log(JSON.stringify(logEntry));
}

module.exports = {
  log
};
