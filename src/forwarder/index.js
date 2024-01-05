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
 * Autoscaler Forwarder function
 *
 * * Forwards PubSub messages from the Scheduler topic to the Poller topic.
 */
// eslint-disable-next-line no-unused-vars -- for type checking only.
const express = require('express');
const {PubSub} = require('@google-cloud/pubsub');

// GCP service clients
const pubSub = new PubSub();

/**
 * Output a structured log message to stdout
 *
 * @param {!string} message
 * @param {?string} severity
 * @param {?*} payload
 */
function log(message, severity = 'DEBUG', payload) {
  // Structured logging
  // https://cloud.google.com/functions/docs/monitoring/logging#writing_structured_logs

  if (!!payload) {
    // If payload is an Error, get the stack trace.
    if (payload instanceof Error && !!payload.stack) {
      if (!!message) {
        message = message + '\n' + payload.stack;
      } else {
        message = payload.stack;
      }
    }
  }
  const logEntry = {message: message, severity: severity, payload: payload};
  console.log(JSON.stringify(logEntry));
}

/**
 * Handle the forwarder request from HTTP
 *
 * For testing purposes - uses a fixed message.
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
exports.forwardFromHTTP = async (req, res) => {
  const payloadString =
    '[{ ' +
    '  "projectId": "spanner-scaler", ' +
    '  "instanceId": "my-spanner", ' +
    '  "scalerPubSubTopic": "projects/spanner-scaler/topics/my-scaling", ' +
    '  "minNodes": 1, ' +
    '  "maxNodes": 3, ' +
    '  "stateProjectId" : "spanner-scaler" ' +
    '}]';
  try {
    const payload = Buffer.from(payloadString, 'utf8');

    JSON.parse(payload.toString()); // Log exception in App project if payload
    // cannot be parsed
    const pollerTopic = pubSub.topic(process.env.POLLER_TOPIC);
    pollerTopic.publish(payload);

    res.status(200).end();
  } catch (err) {
    log('failed to process payload: \n' + payloadString, 'ERROR', err);
    res.status(500).end(err.toString());
  }
};

/**
 * Handle the Forwarder request from PubSub
 *
 * @param {Object} pubSubEvent
 * @param {*} context
 */
exports.forwardFromPubSub = async (pubSubEvent, context) => {
  let payload;
  try {
    payload = Buffer.from(pubSubEvent.data, 'base64');
    JSON.parse(payload.toString()); // Log exception in App project if payload
    // cannot be parsed

    const pollerTopic = pubSub.topic(process.env.POLLER_TOPIC);
    pollerTopic.publishMessage({data: payload});

    console.log('Poll request forwarded to ' + process.env.POLLER_TOPIC);
  } catch (err) {
    log('failed to process pubsub payload: \n' + pubSubEvent.data, 'ERROR',
        err);
  }
};
