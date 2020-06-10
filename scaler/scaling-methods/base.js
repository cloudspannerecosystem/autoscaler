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
 * Base module that encapsulates functionality common to scaling methods:
 * * Loop through the Spanner metrics
 * * Determine if the Spanner instance is overloaded
 * * Log node suggestions per metric
 */

// Only the high_priority_cpu metric is used to determine if an overload situation exists
const OVERLOAD_METRIC = 'high_priority_cpu';
const OVERLOAD_THRESHOLD = 90;

function logSuggestion(spanner, metric, suggestedNodes) {

  var aboveOrBelow = (metric.value > metric.threshold ? 'ABOVE' : 'BELOW');
  var threshold = metric.threshold;
  var overload = '';

  if (metric.name === OVERLOAD_METRIC && spanner.isOverloaded) {
    threshold = OVERLOAD_THRESHOLD;
    overload = ' OVERLOAD';
  }

  console.log(`\t${metric.name}=${metric.value}, ${aboveOrBelow} the ${threshold}${overload} threshold => suggesting ${suggestedNodes} nodes.`);
}

function loopThroughSpannerMetrics (spanner, getSuggestedNodes) {
  console.log('---- ' + spanner.projectId + "/" + spanner.instanceId + ": "+ spanner.scalingMethod + ' node suggestions' + '----');
  console.log("\tNodes: Min=" + spanner.minNodes + ', Current=' + spanner.currentNodes + ', Max=' + spanner.maxNodes);

  var maxSuggestedNodes = spanner.minNodes;
  spanner.isOverloaded = false;

  for (const metric of spanner.metrics) {

    if (metric.name === OVERLOAD_METRIC && metric.value > OVERLOAD_THRESHOLD) spanner.isOverloaded = true;
    const suggestedNodes = getSuggestedNodes(spanner, metric);
    logSuggestion(spanner, metric, suggestedNodes);

    maxSuggestedNodes = Math.max(maxSuggestedNodes, suggestedNodes);
  }

  maxSuggestedNodes = Math.min(maxSuggestedNodes, spanner.maxNodes);
  console.log('\t=> Final ' + spanner.scalingMethod + ' suggestion: ' + maxSuggestedNodes + ' nodes');
  return maxSuggestedNodes;
}

module.exports = {
  OVERLOAD_METRIC,
  loopThroughSpannerMetrics
};