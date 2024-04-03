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
const {logger} = require('../autoscaler-common/logger');
const assertDefined = require('../autoscaler-common/assertDefined');

// GCP service clients
const pubSub = new PubSub();

/**
 * Handle the forwarder request from HTTP
 *
 * For testing purposes - uses a fixed message.
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function forwardFromHTTP(req, res) {
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

    const pollerTopicName = assertDefined(
      process.env.POLLER_TOPIC,
      'POLLER_TOPIC environment variable',
    );

    const pollerTopic = pubSub.topic(pollerTopicName);
    pollerTopic.publishMessage({data: payload});
    logger.debug({
      message: `Poll request forwarded to PubSub Topic ${pollerTopicName}`,
    });
    res.status(200).end();
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler forwarder (HTTP): ${err}`,
      err: err,
      payload: payloadString,
    });
    res.status(500).end('An exception occurred');
  }
}

/**
 * Handle the Forwarder request from PubSub
 *
 * @param {any} pubSubEvent
 * @param {*} context
 */
async function forwardFromPubSub(pubSubEvent, context) {
  let payload;
  try {
    payload = Buffer.from(pubSubEvent.data, 'base64');
    JSON.parse(payload.toString()); // Log exception in App project if payload
    // cannot be parsed

    const pollerTopicName = assertDefined(
      process.env.POLLER_TOPIC,
      'POLLER_TOPIC environment variable',
    );
    const pollerTopic = pubSub.topic(pollerTopicName);
    pollerTopic.publishMessage({data: payload});
    logger.debug({
      message: `Poll request forwarded to PubSub Topic ${pollerTopicName}`,
    });
  } catch (err) {
    logger.error({
      message: `An error occurred in the Autoscaler forwarder (PubSub): ${err}`,
      err: err,
      payload: payload,
    });
  }
}

module.exports = {
  forwardFromHTTP,
  forwardFromPubSub,
};
