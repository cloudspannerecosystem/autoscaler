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
const should = require('should');
const sinon = require('sinon');
const SizeHelper = require('../../size-helper');

const app = rewire('../../scaling-methods/base.js');

const compareMetricValueWithRange = app.__get__('compareMetricValueWithRange');
describe('#compareMetricValueWithRange', () => {
    it('should return WITHIN when value is within range', () => {
        compareMetricValueWithRange({value: 70, threshold:65, margin:5}).should.equal('WITHIN')
    });

    it('should return ABOVE when value is above range', () => {
        compareMetricValueWithRange({value: 80, threshold:65, margin:5}).should.equal('ABOVE')
    });

    it('should return BELOW when value is below range', () => {
        compareMetricValueWithRange({value: 20, threshold:65, margin:5}).should.equal('BELOW')
    });
});

const metricValueWithinRange = app.__get__('metricValueWithinRange');
describe('#metricValueWithinRange', () => {
    it('should return true when metric falls within margins', () => {
        metricValueWithinRange({value: 63, threshold:65, margin:5}).should.be.true();
    });

    it('should return false when metric falls outside of the margins', () => {
        metricValueWithinRange({value: 15, threshold:45, margin:10}).should.be.false();
    });

    it('should return true when metric falls right at the edge', () => {
        metricValueWithinRange({value: 70, threshold:65, margin:5}).should.be.true();
    });
});

const getRange = app.__get__('getRange');
describe('#getRange', () => {
    it('should return a correct range: [th - margin, th + margin]', () => {
        var range = getRange(65, 5);
        range.should.have.property('min').which.is.a.Number().and.equal(60);
        range.should.have.property('max').which.is.a.Number().and.equal(70);
    });

    it('should return a max value of 100: [th - margin, 100]', () => {
        var range = getRange(80, 30);
        range.should.have.property('min').which.is.a.Number().and.equal(50);
        range.should.have.property('max').which.is.a.Number().and.equal(100);
    });

    it('should return a min value of 0: [0, th + margin]', () => {
        var range = getRange(20, 30);
        range.should.have.property('min').which.is.a.Number().and.equal(0);
        range.should.have.property('max').which.is.a.Number().and.equal(50);
    });

});

function addSizeHelperTo(spanner) {
    spanner.size = new SizeHelper(spanner);
    return spanner
}

const getScaleSuggestionMessage = app.__get__('getScaleSuggestionMessage');
describe('#getScaleSuggestionMessage', () => {
    it('should suggest no change when metric value within range', () => {
        getScaleSuggestionMessage({}, 999, 'WITHIN').should.containEql('no change');
    });

    // NODES -------------------------------------------------- 
    it('should suggest no change when current nodes == MIN', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'NODES', currentNodes:2, minSize: 2}), 2, '')
        msg.should.containEql('no change');
        msg.should.containEql('MIN nodes');
        msg.should.not.containEql('processing units');
    });

    it('should suggest no change when current nodes == MAX', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'NODES', currentNodes:8, maxSize: 8}), 8, '');
        msg.should.containEql('no change');
        msg.should.containEql('MAX nodes');
        msg.should.not.containEql('processing units');
    });

    it('should suggest no change when current nodes == suggested nodes', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'NODES', currentNodes:8, maxSize: 20}), 8, '')
        msg.should.containEql('no change');
        msg.should.not.containEql('MAX nodes');
        msg.should.not.containEql('processing units');
    });

    it('should suggest to scale when current nodes != suggested nodes', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'NODES', currentNodes:5}), 8, '')
        msg.should.containEql('suggesting to scale');
        msg.should.containEql('nodes');
        msg.should.not.containEql('processing units');
    });

    // PROCESSING_UNITS ---------------------------------------
    it('should suggest no change when current processing units == MIN', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'PROCESSING_UNITS', currentProcessingUnits:200, minSize: 200}), 200, '')
        msg.should.containEql('no change');
        msg.should.containEql('MIN processing units');
        msg.should.not.containEql('nodes');
    });

    it('should suggest no change when current processing units == MAX', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'PROCESSING_UNITS', currentProcessingUnits:800, maxSize: 800}), 800, '');
        msg.should.containEql('no change');
        msg.should.containEql('MAX processing units');
        msg.should.not.containEql('nodes');
    });

    it('should suggest no change when current processing units == suggested processing units', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'PROCESSING_UNITS', currentProcessingUnits:800, maxSize: 2000}), 800, '')
        msg.should.containEql('no change');
        msg.should.not.containEql('MAX processing units');
        msg.should.not.containEql('nodes');
    });

    it('should suggest to scale when current processing units != suggested processing units', () => {
        var msg = getScaleSuggestionMessage(addSizeHelperTo({units:'PROCESSING_UNITS', currentProcessingUnits:500}), 800, '')
        msg.should.containEql('suggesting to scale');
        msg.should.containEql('processing units');
        msg.should.not.containEql('nodes');
    });

}); 

function getSpannerJSON() {
    spanner = {
        units : 'NODES', 
        minSize: 1, 
        metrics: [{
            name: 'high_priority_cpu',
            threshold:65,
            value:95
        }, {
            name: 'rolling_24_hr',
            threshold:90,
            value:80
        }
        ]
    };
    spanner.size = new SizeHelper(spanner);
    return spanner;
}

const loopThroughSpannerMetrics = app.__get__('loopThroughSpannerMetrics');
describe('#loopThroughSpannerMetrics', () => {

    it('should add a default margin to each metric', () => {
        var spanner = getSpannerJSON();

        loopThroughSpannerMetrics(spanner, sinon.stub().returns(1));
        spanner.metrics[0].should.have.property('margin');
        spanner.metrics[1].should.have.property('margin');
    });

    it('should not overwrite an existing margin', () => {
        var spanner = getSpannerJSON();
        spanner.metrics[1].margin = 99;

        loopThroughSpannerMetrics(spanner, sinon.stub().returns(1));
        spanner.metrics[0].should.have.property('margin');
        spanner.metrics[1].should.have.property('margin').and.equal(99);
    });

}); 