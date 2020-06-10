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
 * * Receives metrics from the Autoscaler Poller pertaining to a single Spanner instance.
 * * Determines if the Spanner instance can be autoscaled
 * * Selects a scaling method, and gets a number of suggested nodes
 * * Autoscales the Spanner instance by the number of suggested nodes
 */

const {Spanner} = require('@google-cloud/spanner');
const State = require('./state.js');

function getScalingMethod(methodName) {
  const SCALING_METHODS_FOLDER = './scaling-methods/';
  const DEFAULT_METHOD_NAME = 'STEPWISE';

  var scalingMethod;
  try {
    scalingMethod = require(SCALING_METHODS_FOLDER + methodName.toLowerCase());
  } catch (err) {
    console.warn("Unknown scaling method '" + methodName + "'");
    scalingMethod = require(SCALING_METHODS_FOLDER + DEFAULT_METHOD_NAME.toLowerCase()); 
    methodName = DEFAULT_METHOD_NAME;
  }
  console.log("Using scaling method: " + methodName);
  return scalingMethod;
}

async function scaleSpannerInstance(spanner, suggestedNodes) {
 
  console.log("----- " + spanner.projectId + "/" + spanner.instanceId + ": Scaling spanner instance to " + suggestedNodes + " nodes -----");

  const metadata = {
    //displayName : 'instance' + Math.floor(Math.random() * 100) // For testing. See next line for actual scaling
    nodeCount: suggestedNodes
  };

  const spannerClient = new Spanner({
    projectId: spanner.projectId,
  });

  return spannerClient.instance(spanner.instanceId).setMetadata(metadata).then(function(data) {
    const operation = data[0];
    console.log("Cloud Spanner started the scaling operation: " + operation.name);
   });
}

function convertMillisecToHumanReadable(millisec) {
// By Nofi @ https://stackoverflow.com/a/32180863

  var seconds = (millisec / 1000).toFixed(1);
  var minutes = (millisec / (1000 * 60)).toFixed(1);
  var hours = (millisec / (1000 * 60 * 60)).toFixed(1);
  var days = (millisec / (1000 * 60 * 60 * 24)).toFixed(1);

  if (seconds < 60) {
      return seconds + " Sec";
  } else if (minutes < 60) {
      return minutes + " Min";
  } else if (hours < 24) {
      return hours + " Hrs";
  } else {
      return days + " Days"
  }
}

function withinCooldownPeriod(spanner, suggestedNodes, autoscalerState, now) {
  const MS_IN_1_MIN = 60000;
  const scaleOutSuggested = (suggestedNodes - spanner.currentNodes > 0);
  var operation; 
  var cooldownPeriodOver;
  var duringOverload = '';

  console.log("----- " + spanner.projectId + "/" + spanner.instanceId + ": Verifing if scaling is allowed -----");
  operation = scaleOutSuggested ?  
    { description : "scale out", lastScalingMillisec : autoscalerState.lastScalingTimestamp, coolingMillisec : spanner.scaleOutCoolingMinutes * MS_IN_1_MIN } :
    { description : "scale in", lastScalingMillisec : autoscalerState.lastScalingTimestamp, coolingMillisec : spanner.scaleInCoolingMinutes * MS_IN_1_MIN }

  if (spanner.isOverloaded) {
    if (spanner.overloadCoolingMinutes == null ) {
      spanner.overloadCoolingMinutes = spanner.scaleOutCoolingMinutes;
      console.log(`\tNo cooldown period defined for overload situations. Using default: ${spanner.scaleOutCoolingMinutes} minutes`)
    }
    operation.coolingMillisec = spanner.overloadCoolingMinutes * MS_IN_1_MIN;
    duringOverload = ' during overload'
  }

  if (operation.lastScalingMillisec == 0) {
    cooldownPeriodOver = true;
    console.log("\tNo previous scaling operation found for this Spanner instance");
  } else {
    const elapsedMillisec = now - operation.lastScalingMillisec;
    cooldownPeriodOver = (elapsedMillisec >= operation.coolingMillisec);
    console.log("\tLast scaling operation was " + convertMillisecToHumanReadable(now - operation.lastScalingMillisec) + " ago.");
    console.log("\tCooldown period for " + operation.description + duringOverload + " is " + convertMillisecToHumanReadable(operation.coolingMillisec) + ".");
  }

  if (cooldownPeriodOver){
    console.log("\t=> Autoscale allowed");
    return false;
  }
  else {
    console.log("\t=> Autoscale NOT allowed yet");
    return true;
  }
}

async function processScalingRequest(spanner) {

  const suggestedNodes = getScalingMethod(spanner.scalingMethod).calculateNumNodes(spanner);
  if (suggestedNodes == spanner.currentNodes) {
    console.log(`----- ${spanner.projectId}/${spanner.instanceId}: has ${spanner.currentNodes} nodes, no scaling needed at the moment`);
    return;
  }

  var autoscalerState = new State(spanner);
  if (!withinCooldownPeriod(spanner, suggestedNodes, await autoscalerState.get(), autoscalerState.now)) {
    try {
      await scaleSpannerInstance(spanner, suggestedNodes);
      await autoscalerState.set();
    } catch(err) { 
      console.log("----- " + spanner.projectId + "/" + spanner.instanceId + ': [' + err.constructor.name + '] Unsuccessful scaling attempt.');
      console.debug(err);
    }
  }
}

exports.scaleSpannerInstancePubSub = async (pubSubEvent, context) => {
  try {
    const payload = Buffer.from(pubSubEvent.data, 'base64').toString();
    console.log(payload);
  
    await processScalingRequest(JSON.parse(payload));
  } catch (err) {
    console.error(err);
  }
};

// For testing with: https://cloud.google.com/functions/docs/functions-framework
exports.scaleSpannerInstanceHTTP = async (req, res) => {
  try {
    const payload ='{"minNodes":1,"maxNodes":3,"stepSize":1,"overloadStepSize":5,"scaleOutCoolingMinutes":5,"scaleInCoolingMinutes":30,"scalingMethod":"STEPWISE","projectId":"spanner-scaler","instanceId":"autoscale-test","scalerPubSubTopic":"projects/spanner-scaler/topics/test-scaling","metrics":[{"name":"high_priority_cpu","threshold":65,"value":95},{"name":"rolling_24_hr","threshold":90,"value":80},{"name":"storage","threshold":75,"value":80}],"currentNodes":1,"regional":true}';
    console.log(payload);

    await processScalingRequest(JSON.parse(payload));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end(err.toString()); 
  }
}
