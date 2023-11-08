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
 * Autoscaler Scaler function
 *
 * * Receives metrics from the Autoscaler Poller pertaining to a single Spanner
 * instance.
 * * Determines if the Spanner instance can be autoscaled
 * * Selects a scaling method, and gets a number of suggested nodes
 * * Autoscales the Spanner instance by the number of suggested nodes
 */
// eslint-disable-next-line no-unused-vars -- for type checking only.
const express = require('express');
// eslint-disable-next-line no-unused-vars -- spannerProtos used for type checks
const {Spanner, protos: spannerProtos} = require('@google-cloud/spanner');
const Counters = require('./counters.js');
const sanitize = require('sanitize-filename');
const {convertMillisecToHumanReadable} = require('./utils.js');
const {logger} = require('../../autoscaler-common/logger');
const {publishProtoMsgDownstream} = require('./utils.js');
const State = require('./state.js');
const fs = require('fs');
const {AutoscalerUnits} = require('../../autoscaler-common/types');

/**
 * @typedef {import('../../autoscaler-common/types').AutoscalerSpanner
 * } AutoscalerSpanner
 * @typedef {import('./state.js').StateData} StateData
 */


/**
 * Get scaling method function by name.
 *
 * @param {string} methodName
 * @param {string} projectId
 * @param {string} instanceId
 * @return {{
 *  calculateSize: function(AutoscalerSpanner):number,
 *  calculateNumNodes: function(AutoscalerSpanner): number
 * }}
 */
function getScalingMethod(methodName, projectId, instanceId) {
  const SCALING_METHODS_FOLDER = './scaling-methods/';
  const DEFAULT_METHOD_NAME = 'STEPWISE';

  // sanitize the method name before using
  // to prevent risk of directory traversal.
  methodName = sanitize(methodName);
  let scalingMethod;
  try {
    scalingMethod = require(SCALING_METHODS_FOLDER + methodName.toLowerCase());
  } catch (err) {
    logger.warn({
      message: `Unknown scaling method '${methodName}'`,
      projectId: projectId, instanceId: instanceId});
    scalingMethod =
        require(SCALING_METHODS_FOLDER + DEFAULT_METHOD_NAME.toLowerCase());
    methodName = DEFAULT_METHOD_NAME;
  }
  logger.info({
    message: `Using scaling method: ${methodName}`,
    projectId: projectId, instanceId: instanceId});
  return scalingMethod;
}

/**
 * Build metadata object.
 *
 * @param {number} suggestedSize
 * @param {AutoscalerUnits} units
 * @return {spannerProtos.google.spanner.admin.instance.v1.IInstance}}
 */
function getNewMetadata(suggestedSize, units) {
  const metadata = (units === AutoscalerUnits.NODES) ?
    {nodeCount: suggestedSize} :
    {processingUnits: suggestedSize};

  // For testing:
  // metadata = { displayName : 'a' + Math.floor(Math.random() * 100) + '_' +
  // suggestedSize + '_' + units };
  return metadata;
}

/**
 * Scale the specified spanner instance to the specified size
 *
 * @param {AutoscalerSpanner} spanner
 * @param {number} suggestedSize
 * @return {Promise}
 */
async function scaleSpannerInstance(spanner, suggestedSize) {
  logger.info({
    message: `----- ${spanner.projectId}/${
      spanner.instanceId}: Scaling Spanner instance to ${suggestedSize} ${
      spanner.units} -----`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
  });

  const spannerClient = new Spanner({
    projectId: spanner.projectId,
    // @ts-ignore -- hidden property of ServiceOptions.
    userAgent: 'cloud-solutions/spanner-autoscaler-scaler-usage-v1.0',
  });

  return spannerClient.instance(spanner.instanceId)
      .setMetadata(getNewMetadata(suggestedSize, spanner.units))
      .then(function(data) {
        const operation = data[0];
        logger.debug({
          message:
              `Cloud Spanner started the scaling operation: ${operation.name}`,
          projectId: spanner.projectId, instanceId: spanner.instanceId});
      });
}

/**
 * Publish scaling PubSub event.
 *
 * @param {string} eventName
 * @param {AutoscalerSpanner} spanner
 * @param {number} suggestedSize
 * @return {Promise}
 */
async function publishDownstreamEvent(eventName, spanner, suggestedSize) {
  const message = {
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
    currentSize: spanner.currentSize,
    suggestedSize: suggestedSize,
    units: spanner.units,
    metrics: spanner.metrics,
  };

  return publishProtoMsgDownstream(
      eventName, message, spanner.downstreamPubSubTopic);
}

/**
 * Test to see if spanner instance is in post-scale cooldown.
 *
 * @param {AutoscalerSpanner} spanner
 * @param {number} suggestedSize
 * @param {StateData} autoscalerState
 * @param {number} now timestamp in millis since epoch
 * @return {boolean}
 */
function withinCooldownPeriod(spanner, suggestedSize, autoscalerState, now) {
  const MS_IN_1_MIN = 60000;
  const scaleOutSuggested = (suggestedSize - spanner.currentSize > 0);
  let cooldownPeriodOver;
  let duringOverload = '';

  logger.debug({
    message: `-----  ${spanner.projectId}/${
      spanner.instanceId}: Verifying if scaling is allowed -----`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId});
  const operation =
      (scaleOutSuggested ?
           {
             description: 'scale out',
             lastScalingMillisec: autoscalerState.lastScalingTimestamp,
             coolingMillisec: spanner.scaleOutCoolingMinutes * MS_IN_1_MIN,
           } :
           {
             description: 'scale in',
             lastScalingMillisec: autoscalerState.lastScalingTimestamp,
             coolingMillisec: spanner.scaleInCoolingMinutes * MS_IN_1_MIN,
           });

  if (spanner.isOverloaded) {
    if (spanner.overloadCoolingMinutes == null) {
      spanner.overloadCoolingMinutes = spanner.scaleOutCoolingMinutes;
      logger.info({
        message: '\tNo cooldown period defined for overload situations. ' +
          `Using default: ${spanner.scaleOutCoolingMinutes} minutes`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
      });
    }
    operation.coolingMillisec = spanner.overloadCoolingMinutes * MS_IN_1_MIN;
    duringOverload = ' during overload';
  }

  if (operation.lastScalingMillisec == 0) {
    cooldownPeriodOver = true;
    logger.debug({
      message:
          `\tNo previous scaling operation found for this Spanner instance`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });
  } else {
    const elapsedMillisec = now - operation.lastScalingMillisec;
    cooldownPeriodOver = (elapsedMillisec >= operation.coolingMillisec);
    logger.debug({
      message: `\tLast scaling operation was ${
        convertMillisecToHumanReadable(
            now - operation.lastScalingMillisec)} ago.`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId});
    logger.debug({
      message: `\tCooldown period for ${operation.description}${
        duringOverload} is ${
        convertMillisecToHumanReadable(operation.coolingMillisec)}.`,
      projectId: spanner.projectId, instanceId: spanner.instanceId});
  }

  if (cooldownPeriodOver) {
    logger.info({
      message: `\t=> Autoscale allowed`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });
    return false;
  } else {
    logger.info({
      message: `\t=> Autoscale NOT allowed yet`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
    });
    return true;
  }
}

/**
 * Get Suggested size from config using scalingMethod
 * @param {AutoscalerSpanner} spanner
 * @return {number}
 */
function getSuggestedSize(spanner) {
  const scalingMethod = getScalingMethod(
      spanner.scalingMethod, spanner.projectId, spanner.instanceId);
  if (scalingMethod.calculateSize) {
    return scalingMethod.calculateSize(spanner);
  } else if (scalingMethod.calculateNumNodes) {
    logger.warn(`scaling method ${
      spanner.scalingMethod} uses deprecated calculateNumNodes function`);
    return scalingMethod.calculateNumNodes(spanner);
  } else {
    throw new Error(`no calculateSize() in scaling method ${
      spanner.scalingMethod}`);
  }
}

/**
 * Process the request to check a spanner instance for scaling
 *
 * @param {AutoscalerSpanner} spanner
 * @param {State} autoscalerState
 */
async function processScalingRequest(spanner, autoscalerState) {
  logger.info({
    message: `----- ${spanner.projectId}/${
      spanner.instanceId}: Scaling request received`,
    projectId: spanner.projectId,
    instanceId: spanner.instanceId,
    payload: spanner,
  });

  const suggestedSize = getSuggestedSize(spanner);
  if (suggestedSize === spanner.maxSize) {
    logger.info({
      message: `----- ${spanner.projectId}/${spanner.instanceId}: has ${
        spanner.currentSize} ${
        spanner.units}, no scaling possible - at maxSize`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: spanner,
    });
    await Counters.incScalingDeniedCounter(
        spanner,
        suggestedSize,
        'MAX_SIZE');
    return;
  } else if (suggestedSize === spanner.currentSize) {
    logger.info({
      message: `----- ${spanner.projectId}/${spanner.instanceId}: has ${
        spanner.currentSize} ${
        spanner.units}, no scaling needed - at current size`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: spanner,
    });
    await Counters.incScalingDeniedCounter(
        spanner,
        suggestedSize,
        'CURRENT_SIZE');
    return;
  }

  if (!withinCooldownPeriod(
      spanner, suggestedSize, await autoscalerState.get(),
      autoscalerState.now)) {
    let eventType;
    try {
      await scaleSpannerInstance(spanner, suggestedSize);
      await autoscalerState.set();
      eventType = 'SCALING';
      await Counters.incScalingSuccessCounter(
          spanner,
          suggestedSize);
    } catch (err) {
      logger.error({
        message: `----- ${spanner.projectId}/${
          spanner.instanceId}: Unsuccessful scaling attempt.`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: err,
        err: err,
      });
      logger.error({
        message:
          `----- ${spanner.projectId}/${spanner.instanceId}: Spanner payload:`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
      });
      eventType = 'SCALING_FAILURE';
      await Counters.incScalingFailedCounter(
          spanner,
          suggestedSize);
    }
    await publishDownstreamEvent(eventType, spanner, suggestedSize);
  } else {
    logger.info({
      message: `----- ${spanner.projectId}/${spanner.instanceId}: has ${
        spanner.currentSize} ${
        spanner.units}, no scaling possible - within cooldown period`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: spanner,
    });
    await Counters.incScalingDeniedCounter(
        spanner,
        suggestedSize,
        'WITHIN_COOLDOWN');
  }
}

/**
 * Handle scale request from a PubSub event.
 *
 * @param {{data:string}} pubSubEvent -- a CloudEvent object.
 * @param {*} context
 */
async function scaleSpannerInstancePubSub(pubSubEvent, context) {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    const spanner = JSON.parse(payload);
    try {
      const state = State.buildFor(spanner);

      await processScalingRequest(spanner, state);
      await state.close();
      await Counters.incRequestsSuccessCounter();
    } catch (err) {
      logger.error({
        message: `Failed to process scaling request\n`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        payload: spanner,
      });
      logger.error({
        message: `Exception\n`,
        projectId: spanner.projectId,
        instanceId: spanner.instanceId,
        err: err,
      });
      await Counters.incRequestsFailedCounter();
    }
  } catch (err) {
    logger.error({
      message: `Failed to parse pubSub scaling request\n`,
      payload: pubSubEvent.data,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * Test to handle scale request from a HTTP call with fixed payload
 * For testing with: https://cloud.google.com/functions/docs/functions-framework
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function scaleSpannerInstanceHTTP(req, res) {
  try {
    const payload = fs.readFileSync('./test/samples/parameters.json', 'utf-8');
    const spanner = JSON.parse(payload);
    try {
      const state = State.buildFor(spanner);

      await processScalingRequest(spanner, state);
      await state.close();

      res.status(200).end();
      await Counters.incRequestsSuccessCounter();
    } catch (err) {
      console.error(err);
      res.status(500).end(err.toString());
      await Counters.incRequestsFailedCounter();
    }
  } catch (err) {
    logger.error({
      message: `Failed to parse http scaling request\n`,
      err: err,
    });
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * Handle scale request from a HTTP call with JSON payload

 * @param {express.Request} req
 * @param {express.Response} res
 */
async function scaleSpannerInstanceJSON(req, res) {
  const spanner = req.body;
  try {
    const state = State.buildFor(spanner);

    await processScalingRequest(spanner, state);
    await state.close();

    res.status(200).end();
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      message: `Failed to process scaling request\n`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: spanner,
    });
    logger.error({
      message: `Exception\n`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: err,
      err: err,
    });
    res.writeHead(500, {
      'Content-Type': 'text/plain',
    });
    res.end(err.toString());
    await Counters.incRequestsFailedCounter();
  } finally {
    await Counters.tryFlush();
  }
}

/**
 * Handle scale request from local function call
 * @param {AutoscalerSpanner} spanner
 */
async function scaleSpannerInstanceLocal(spanner) {
  try {
    const state = State.buildFor(spanner);

    await processScalingRequest(spanner, state);
    await state.close();
    await Counters.incRequestsSuccessCounter();
  } catch (err) {
    logger.error({
      message: `Failed to process scaling request\n`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: spanner,
    });
    logger.error({
      message: `Exception\n`,
      projectId: spanner.projectId,
      instanceId: spanner.instanceId,
      payload: err,
      err: err,
    });
  } finally {
    await Counters.tryFlush();
  }
}

module.exports = {
  scaleSpannerInstanceHTTP,
  scaleSpannerInstancePubSub,
  scaleSpannerInstanceJSON,
  scaleSpannerInstanceLocal,
};
