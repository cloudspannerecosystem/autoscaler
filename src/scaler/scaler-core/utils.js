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
 */

// Create PubSub client and cache it
const {PubSub} = require('@google-cloud/pubsub');
const pubsub = new PubSub();
const protobuf = require('protobufjs');

/**
 * Format duration as human-readable text
 *
 * @param {number} millisec
 * @return {string}
 */
function convertMillisecToHumanReadable(millisec) {
  // By Nofi @ https://stackoverflow.com/a/32180863
  const seconds = (millisec / 1000).toFixed(1);
  const minutes = (millisec / (1000 * 60)).toFixed(1);
  const hours = (millisec / (1000 * 60 * 60)).toFixed(1);
  const days = (millisec / (1000 * 60 * 60 * 24)).toFixed(1);

  if (seconds < 60) {
    return seconds + ' Sec';
  } else if (minutes < 60) {
    return minutes + ' Min';
  } else if (hours < 24) {
    return hours + ' Hrs';
  } else {
    return days + ' Days';
  }
}

/**
 * Round Processing units size to next interval.
 *
 * @param {number} suggestedSize
 * @param {string} units
 * @param {string} label
 * @param {string} projectId
 * @param {string} instanceId
 * @return {number} rounded number
 */
function maybeRound(suggestedSize, units, label = '', projectId, instanceId) {
  if (units == 'NODES') {
    return suggestedSize;
  } else {
    const roundTo = (suggestedSize < 1000) ? 100 : 1000;
    const roundedSize = Math.ceil(suggestedSize / roundTo) * roundTo;
    if (roundedSize != suggestedSize) {
      log(`\t${label}: Suggested ${suggestedSize}, rounded to ${roundedSize} ${
        units}`,
      {projectId: projectId, instanceId: instanceId});
    }
    return roundedSize;
  }
}

/**
 * Structured logging
 * https://cloud.google.com/functions/docs/monitoring/logging#writing_structured_logs
 * @param {string} message
 * @param {Object} params
 */
function log(
    message, {severity = 'DEBUG', projectId, instanceId, payload} = {}) {
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

  const logEntry = {
    message: message,
    severity: severity,
    projectId: projectId,
    instanceId: instanceId,
    payload: payload,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Create Pub/Sub messages with Protobuf schema
 * @param {Object} jsonData
 * @return {Object}
 */
async function createProtobufMessage(jsonData) {
  const root = await protobuf.load('downstream.schema.proto');
  const DownstreamEvent = root.lookupType('DownstreamEvent');
  return message = DownstreamEvent.create(jsonData);
}

/**
 * Publish pub/sub message
 *
 * @param {string} eventName
 * @param {Object} jsonData
 * @param {string} topicId
 * @return {Promise}
 */
async function publishProtoMsgDownstream(eventName, jsonData, topicId) {
  if (!topicId) {
    log(`If you want ${eventName} messages published downstream then specify ` +
            'downstreamPubSubTopic in your config.',
    'DEBUG');
    return Promise.resolve();
  }

  const topic = pubsub.topic(topicId);
  const message = await createProtobufMessage(jsonData);
  const data = Buffer.from(JSON.stringify(message.toJSON()));
  const attributes = {event: eventName};

  return topic.publishMessage({data: data, attributes: attributes})
      .then(
          log(`Published ${eventName} message downstream to topic: ${topicId}`,
              'INFO'))
      .catch((err) => {
        log(`An error occurred publishing ${
          eventName} message downstream to topic: ${topicId}`,
        'ERROR', err);
      });
}

module.exports = {
  convertMillisecToHumanReadable,
  maybeRound,
  log,
  publishProtoMsgDownstream,
};
