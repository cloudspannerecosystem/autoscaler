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
 * Suggests adding or removing nodes using fixed step amount.
 */

exports.calculateNumNodes = (spanner) => {
  const baseModule = require('./base');
  return baseModule.loopThroughSpannerMetrics(spanner, (spanner, metric) => {
    if (baseModule.metricValueWithinRange(metric))
      return spanner.currentNodes;  // No change

    var suggestedStep =
        (metric.value > metric.threshold ? spanner.stepSize :
                                           -spanner.stepSize);
    if (metric.name === baseModule.OVERLOAD_METRIC && spanner.isOverloaded)
      suggestedStep = spanner.overloadStepSize;

    return Math.max(spanner.currentNodes + suggestedStep, spanner.minNodes);
  });
}