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
 * Linear scaling method
 *
 * Suggests adding or removing nodes or processing units, 
 * calculated with a cross multiplication.
 * For processing units, it rounds to nearest 100 if suggestion is
 * under 1000, or to nearest 1000 otherwise.
 */
const baseModule = require('./base');
const {log, maybeRound} = require('../utils.js');

function isScaleIn(suggestedSize, currentSize) {
  return suggestedSize < currentSize;
}

function calculateSize(spanner) {
  return baseModule.loopThroughSpannerMetrics(spanner, (spanner, metric) => {
    if (baseModule.metricValueWithinRange(metric)) return spanner.currentSize;
    else {
      var suggestedSize = Math.ceil(spanner.currentSize * metric.value / metric.threshold)
      
      if (isScaleIn(suggestedSize, spanner.currentSize) && spanner.scaleInLimit) {
        const limit = spanner.currentSize * (spanner.scaleInLimit/100)
        
        log(`\tscaleInLimit = ${spanner.scaleInLimit}%, so the maximum scale-in allowed for current size of ${spanner.currentSize} is ${limit} ${spanner.units}.`,
        {severity: 'DEBUG', projectId: spanner.projectId, instanceId: spanner.instanceId});
        
        const originalSuggestedSize = suggestedSize
        suggestedSize = Math.max(suggestedSize, Math.ceil(spanner.currentSize - limit))

        if (suggestedSize != originalSuggestedSize) {
          log(`\tscaleInLimit exceeded. Original suggested size was ${originalSuggestedSize} ${spanner.units}, new suggested size is ${suggestedSize} ${spanner.units}.`,
          {severity: 'DEBUG', projectId: spanner.projectId, instanceId: spanner.instanceId});
        }        
      }
      return maybeRound(suggestedSize, spanner.units, metric.name, spanner.projectId, spanner.instanceId);
    }
  });
}

module.exports = {
  calculateSize
};
