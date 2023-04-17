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

const {Spanner} = require('@google-cloud/spanner');
const {convertMillisecToHumanReadable} = require('./utils.js');
const {log} = require('./utils.js');
const State = require('./state.js');
const fs = require('fs');

function getScalingMethod(methodName, projectId, instanceId) {
  const SCALING_METHODS_FOLDER = './scaling-methods/';
  const DEFAULT_METHOD_NAME = 'STEPWISE';

  var scalingMethod;
  try {
    scalingMethod = require(SCALING_METHODS_FOLDER + methodName.toLowerCase());
  } catch (err) {
    log(`Unknown scaling method '${methodName}'`, {severity: 'WARNING', projectId: projectId, instanceId: instanceId});
    scalingMethod =
        require(SCALING_METHODS_FOLDER + DEFAULT_METHOD_NAME.toLowerCase());
    methodName = DEFAULT_METHOD_NAME;
  }
  log(`Using scaling method: ${methodName}`, {severity: 'INFO', projectId: projectId, instanceId: instanceId});
  return scalingMethod;
}

function getNewMetadata(suggestedSize, units) {
  metadata = (units == 'NODES') ? { nodeCount: suggestedSize } : { processingUnits: suggestedSize };

  // For testing:
  // metadata = { displayName : 'a' + Math.floor(Math.random() * 100) + '_' + suggestedSize + '_' + units };
  return metadata;
}

async function scaleSpannerInstance(spanner, suggestedSize) {
  log(`----- ${spanner.projectId}/${spanner.instanceId}: Scaling Spanner instance to ${suggestedSize} ${spanner.units} -----`,
    {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId});

  const spannerClient = new Spanner({
    projectId: spanner.projectId,
  });

  return spannerClient.instance(spanner.instanceId)
      .setMetadata(getNewMetadata(suggestedSize, spanner.units))
      .then(function(data) {
        const operation = data[0];
        log(`Cloud Spanner started the scaling operation: ${operation.name}`,
          {projectId: spanner.projectId, instanceId: spanner.instanceId});
      });
}

function withinCooldownPeriod(spanner, suggestedSize, autoscalerState, now) {
  const MS_IN_1_MIN = 60000;
  const scaleOutSuggested = (suggestedSize - spanner.currentSize > 0);
  var operation;
  var cooldownPeriodOver;
  var duringOverload = '';

  log(`-----  ${spanner.projectId}/${spanner.instanceId}: Verifying if scaling is allowed -----`,
    {projectId: spanner.projectId, instanceId: spanner.instanceId});
  operation =
      (scaleOutSuggested ?
           {
             description: 'scale out',
             lastScalingMillisec: autoscalerState.lastScalingTimestamp,
             coolingMillisec: spanner.scaleOutCoolingMinutes * MS_IN_1_MIN
           } :
           {
             description: 'scale in',
             lastScalingMillisec: autoscalerState.lastScalingTimestamp,
             coolingMillisec: spanner.scaleInCoolingMinutes * MS_IN_1_MIN
           });

  if (spanner.isOverloaded) {
    if (spanner.overloadCoolingMinutes == null) {
      spanner.overloadCoolingMinutes = spanner.scaleOutCoolingMinutes;
      log(`\tNo cooldown period defined for overload situations. Using default: ${spanner.scaleOutCoolingMinutes} minutes`,
        {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId});
    }
    operation.coolingMillisec = spanner.overloadCoolingMinutes * MS_IN_1_MIN;
    duringOverload = ' during overload';
  }

  if (operation.lastScalingMillisec == 0) {
    cooldownPeriodOver = true;
    log(`\tNo previous scaling operation found for this Spanner instance`,
      {severity: 'DEBUG', projectId: spanner.projectId, instanceId: spanner.instanceId});
  } else {
    const elapsedMillisec = now - operation.lastScalingMillisec;
    cooldownPeriodOver = (elapsedMillisec >= operation.coolingMillisec);
    log(`	Last scaling operation was ${convertMillisecToHumanReadable(now - operation.lastScalingMillisec)} ago.`,
      {projectId: spanner.projectId, instanceId: spanner.instanceId});
    log(`	Cooldown period for ${operation.description}${duringOverload} is ${convertMillisecToHumanReadable(operation.coolingMillisec)}.`,
      {projectId: spanner.projectId, instanceId: spanner.instanceId});
  }

  if (cooldownPeriodOver) {
    log(`\t=> Autoscale allowed`, {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId});
    return false;
  } else {
    log(`\t=> Autoscale NOT allowed yet`, {severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId});
    return true;
  }
}

function getSuggestedSize(spanner) {
  const scalingMethod = getScalingMethod(spanner.scalingMethod, spanner.projectId, spanner.instanceId);
  if (scalingMethod.calculateSize) {
    return scalingMethod.calculateSize(spanner);
  } else {
    return scalingMethod.calculateNumNodes(spanner);
  }
}

async function processScalingRequest(spanner, autoscalerState) {
  log(`----- ${spanner.projectId}/${spanner.instanceId}: Scaling request received`,
    { severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner});

  const suggestedSize = getSuggestedSize(spanner);
  if (suggestedSize == spanner.currentSize) {
    log(`----- ${spanner.projectId}/${spanner.instanceId}: has ${spanner.currentSize} ${spanner.units}, no scaling needed at the moment`,
      { severity: 'INFO', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner });
    return;
  }

  if (!withinCooldownPeriod(
    spanner, suggestedSize, await autoscalerState.get(),
    autoscalerState.now)) {
    try {
      await scaleSpannerInstance(spanner, suggestedSize);
      await autoscalerState.set();
    } catch (err) {
      log(`----- ${spanner.projectId}/${spanner.instanceId}: Unsuccessful scaling attempt.`,
        { severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: err});
      log(`----- ${spanner.projectId}/${spanner.instanceId}: Spanner payload:`,
        { severity: 'WARNING', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner});
    }
  }
}

exports.scaleSpannerInstancePubSub = async (pubSubEvent, context) => {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();

    var spanner = JSON.parse(payload);
    var state = new State(spanner);

    await processScalingRequest(spanner, state);
    await state.close();

  } catch (err) {
    log(`Failed to process scaling request\n`,
      { severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner });
    log(`Exception\n`,
      { severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: err });
  }
};

// For testing with: https://cloud.google.com/functions/docs/functions-framework
exports.scaleSpannerInstanceHTTP = async (req, res) => {
  try {
    const payload = fs.readFileSync('./test/sample-parameters.json');

    var spanner = JSON.parse(payload);
    var state = new State(spanner);

    await processScalingRequest(spanner, state);
    await state.close();

    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end(err.toString());
  }
};

exports.scaleSpannerInstanceJSON = async (req, res) => {
  try {
    var spanner = req.body;
    var state = new State(spanner);

    await processScalingRequest(spanner, state);
    await state.close();

    res.status(200).end();
  } catch (err) {
    log(`Failed to process scaling request\n`,
      { severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: spanner });
    log(`Exception\n`,
      { severity: 'ERROR', projectId: spanner.projectId, instanceId: spanner.instanceId, payload: err });
    res.status(500).end(err.toString());
  }
};

module.exports.log = log;
