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

 const rewire = require('rewire');
 const sinon = require('sinon');
 const should = require('should');

 const app = rewire('../index.js');

 const buildMetrics = app.__get__('buildMetrics');
 const parseAndEnrichPayload = app.__get__('parseAndEnrichPayload');

 describe('#buildMetrics', () => {
    it('should return 3 metrics', () => {
        buildMetrics('fakeProjectId', 'fakeInstanceId').should.have.length(3);
    });

    it('should insert the projectId', () => {
        buildMetrics('fakeProjectId', 'fakeInstanceId')[0].filter.should.have.match(/fakeProjectId/);
    });

    it('should insert the instanceId', () => {
        buildMetrics('fakeProjectId', 'fakeInstanceId')[2].filter.should.have.match(/fakeInstanceId/);
    });
 });

 describe('#parseAndEnrichPayload', () => {
    it('should return the default for stepSize', async () => {
        const payload = '[{"projectId": "my-spanner-project", "instanceId": "spanner1", "scalerPubSubTopic": "spanner-scaling", "minNodes": 10}]';

        let stub = sinon.stub().resolves({currentNode: 5, regional: true});
        let unset = app.__set__('getSpannerMetadata', stub);

        let mergedConfig = await parseAndEnrichPayload(payload);
        (mergedConfig[0].stepSize).should.equal(2);

        unset();
    });

    it('should override the default for minNodes', async () => {
        const payload = '[{"projectId": "my-spanner-project", "instanceId": "spanner1", "scalerPubSubTopic": "spanner-scaling", "minNodes": 10}]';

        let stub = sinon.stub().resolves({currentNode: 5, regional: true});
        let unset = app.__set__('getSpannerMetadata', stub);

        let mergedConfig = await parseAndEnrichPayload(payload);
        (mergedConfig[0].minNodes).should.equal(10);

        unset();
    });

    it('should override the regional threshold for storage but not high_priority_cpu', async () => {
        const payload = '[{"projectId": "my-spanner-project", "instanceId": "spanner1", "scalerPubSubTopic": "spanner-scaling", "minNodes": 10, "metrics": [{"name": "storage", "regional_threshold":10}]}]';

        let stub = sinon.stub().resolves({currentNode: 5, regional: true});
        let unset = app.__set__('getSpannerMetadata', stub);

        let mergedConfig = await parseAndEnrichPayload(payload);

        let idx = mergedConfig[0].metrics.findIndex(x => x.name === 'storage');
        (mergedConfig[0].metrics[idx].regional_threshold).should.equal(10);
        idx = mergedConfig[0].metrics.findIndex(x => x.name === 'high_priority_cpu');
        (mergedConfig[0].metrics[idx].regional_threshold).should.equal(65);

        unset();
    });

    it('should override the multiple thresholds', async () => {
        const payload = '[{"projectId": "my-spanner-project", "instanceId": "spanner1", "scalerPubSubTopic": "spanner-scaling", "minNodes": 10, "metrics": [{"name": "high_priority_cpu", "multi_regional_threshold":20}, {"name": "storage", "regional_threshold":10}]}]';

        let stub = sinon.stub().resolves({currentNode: 5, regional: true});
        let unset = app.__set__('getSpannerMetadata', stub);

        let mergedConfig = await parseAndEnrichPayload(payload);

        let idx = mergedConfig[0].metrics.findIndex(x => x.name === 'storage');
        (mergedConfig[0].metrics[idx].regional_threshold).should.equal(10);
        idx = mergedConfig[0].metrics.findIndex(x => x.name === 'high_priority_cpu');
        (mergedConfig[0].metrics[idx].multi_regional_threshold).should.equal(20);

        unset();
    });
 });