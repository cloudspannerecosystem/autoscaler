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
const {log, convertMillisecToHumanReadable} = require('./utils.js');
const State = require('./state.js');

function getScalingMethod(methodName) {
  const SCALING_METHODS_FOLDER = './scaling-methods/';
  const DEFAULT_METHOD_NAME = 'STEPWISE';

  var scalingMethod;
  try {
    scalingMethod = require(SCALING_METHODS_FOLDER + methodName.toLowerCase());
  } catch (err) {
    log(`Unknown scaling method '${methodName}'`, 'WARNING');
    scalingMethod =
        require(SCALING_METHODS_FOLDER + DEFAULT_METHOD_NAME.toLowerCase());
    methodName = DEFAULT_METHOD_NAME;
  }
  log(`Using scaling method: ${methodName}`);
  return scalingMethod;
}

function getNewMetadata(suggestedNodes) {
  return {
    // For testing. See next line for actual scaling
    // displayName : 'instance' + Math.floor(Math.random() * 100)
    nodeCount: suggestedNodes
  };
}

async function scaleSpannerInstance(spanner, suggestedNodes) {
  log(`----- ${spanner.projectId}/${spanner.instanceId}: Scaling spanner instance to ${suggestedNodes} nodes -----`,
      'INFO');

  const spannerClient = new Spanner({
    projectId: spanner.projectId,
  });

  return spannerClient.instance(spanner.instanceId)
      .setMetadata(getNewMetadata(suggestedNodes))
      .then(function(data) {
        const operation = data[0];
        log(`Cloud Spanner started the scaling operation: ${operation.name}`);
      });
}

function withinCooldownPeriod(spanner, suggestedNodes, autoscalerState, now) {
  const MS_IN_1_MIN = 60000;
  const scaleOutSuggested = (suggestedNodes - spanner.currentNodes > 0);
  var operation;
  var cooldownPeriodOver;
  var duringOverload = '';

  log(`-----  ${spanner.projectId}/${spanner.instanceId}: Verifing if scaling is allowed -----`,
      'INFO');
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
      log(`\tNo cooldown period defined for overload situations. Using default: ${spanner.scaleOutCoolingMinutes} minutes`);
    }
    operation.coolingMillisec = spanner.overloadCoolingMinutes * MS_IN_1_MIN;
    duringOverload = ' during overload';
  }

  if (operation.lastScalingMillisec == 0) {
    cooldownPeriodOver = true;
    log(`\tNo previous scaling operation found for this Spanner instance`);
  } else {
    const elapsedMillisec = now - operation.lastScalingMillisec;
    cooldownPeriodOver = (elapsedMillisec >= operation.coolingMillisec);
    log(`	Last scaling operation was ${convertMillisecToHumanReadable(now - operation.lastScalingMillisec)} ago.`);
    log(`	Cooldown period for ${operation.description}${duringOverload} is ${convertMillisecToHumanReadable(operation.coolingMillisec)}.`);
  }

  if (cooldownPeriodOver) {
    log(`\t=> Autoscale allowed`, 'INFO');
    return false;
  } else {
    log(`\t=> Autoscale NOT allowed yet`, 'INFO');
    return true;
  }
}

async function processScalingRequest(spanner) {
  log(`----- ${spanner.projectId}/${spanner.instanceId}: Scaling request received`,
      'INFO', spanner);

  const suggestedNodes =
      getScalingMethod(spanner.scalingMethod).calculateNumNodes(spanner);
  if (suggestedNodes == spanner.currentNodes) {
    log(`----- ${spanner.projectId}/${spanner.instanceId}: has ${spanner.currentNodes} nodes, no scaling needed at the moment`,
        'INFO');
    return;
  }

  var autoscalerState = new State(spanner);
  if (!withinCooldownPeriod(
          spanner, suggestedNodes, await autoscalerState.get(),
          autoscalerState.now)) {
    try {
      await scaleSpannerInstance(spanner, suggestedNodes);
      await autoscalerState.set();
    } catch (err) {
      log(`----- ${spanner.projectId}/${spanner.instanceId}: Unsuccessful scaling attempt.`,
          'WARNING', err);
    }
  }
}

exports.scaleSpannerInstancePubSub = async (pubSubEvent, context) => {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();

    await processScalingRequest(JSON.parse(payload));
  } catch (err) {
    log(`Failed to process scaling request:\n` + payload, 'ERROR', err);
  }
};

// For testing with: https://cloud.google.com/functions/docs/functions-framework
exports.scaleSpannerInstanceHTTP = async (req, res) => {
  try {
    const payload =
        '{"minNodes":1,"maxNodes":3,"stepSize":1,"overloadStepSize":5,"scaleOutCoolingMinutes":5,"scaleInCoolingMinutes":30,"scalingMethod":"STEPWISE","projectId":"spanner-scaler","instanceId":"autoscale-test","scalerPubSubTopic":"projects/spanner-scaler/topics/test-scaling","metrics":[{"name":"high_priority_cpu","threshold":65,"value":85, "margin": 15},{"name":"rolling_24_hr","threshold":90,"value":70},{"name":"storage","threshold":75,"value":80}],"currentNodes":1,"regional":true}';

    await processScalingRequest(JSON.parse(payload));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end(err.toString());
  }
};
