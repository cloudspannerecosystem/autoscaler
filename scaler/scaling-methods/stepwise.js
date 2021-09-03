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
 * Stepwise scaling method
 *
 * Default method used by the scaler.
 * Suggests adding or removing nodes or processing units
 * using a fixed step size.
 * For processing units, it rounds to nearest 100 if suggestion is
 * under 1000, or to nearest 1000 otherwise.
 */
const baseModule = require('./base');
const {maybeRound} = require('../utils.js');

function calculateSize(spanner) {
  return baseModule.loopThroughSpannerMetrics(spanner, (spanner, metric) => {
    if (baseModule.metricValueWithinRange(metric))
      return spanner.currentSize;  // No change

    var suggestedStep =
        (metric.value > metric.threshold ? spanner.stepSize:
                                           -spanner.stepSize);
    if (metric.name === baseModule.OVERLOAD_METRIC && spanner.isOverloaded)
      suggestedStep = spanner.overloadStepSize;

    return maybeRound(Math.max(spanner.currentSize + suggestedStep, spanner.minSize), spanner.units, metric.name);
  });
}

module.exports = {
  calculateSize
};