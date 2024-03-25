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

const {Topic} = require('@google-cloud/pubsub');
const rewire = require('rewire');
const sinon = require('sinon');
// @ts-ignore
const referee = require('@sinonjs/referee');
// @ts-ignore
const assert = referee.assert;
const {createDownstreamMsg} = require('./test-utils.js');

const app = rewire('../utils.js');

const {PubSub} = require('@google-cloud/pubsub');
const pubsub = new PubSub();
const protobuf = require('protobufjs');

const maybeRound = app.__get__('maybeRound');
describe('#maybeRound', () => {
  it('should not round when using NODES as units', () => {
    maybeRound(7, 'NODES').should.equal(7);
  });

  it('should round to nearest 100 processing units when suggestion < 1000 PU', () => {
    maybeRound(567, 'PROCESSING_UNITS').should.equal(600);
  });

  it('should round to nearest 1000 processing units when suggestion > 1000 PU', () => {
    maybeRound(1001, 'PROCESSING_UNITS').should.equal(2000);
  });
});

const publishProtoMsgDownstream = app.__get__('publishProtoMsgDownstream');
describe('#publishProtoMsgDownstream', () => {
  beforeEach(function () {
    sinon.restore();
  });

  it('should not instantiate downstream topic if not defined in config', async function () {
    const stubPubSub = sinon.stub(pubsub);
    app.__set__('pubsub', stubPubSub);

    await publishProtoMsgDownstream('EVENT', '', undefined);

    assert(stubPubSub.topic.notCalled);
  });

  it('should publish downstream message', async function () {
    const stubTopic = sinon.createStubInstance(Topic);
    stubTopic.publishMessage.resolves();
    const stubPubSub = sinon.stub(pubsub);
    stubPubSub.topic.returns(stubTopic);

    app.__set__('pubsub', stubPubSub);
    app.__set__(
      'createProtobufMessage',
      sinon.stub().returns(Buffer.from('{}')),
    );

    await publishProtoMsgDownstream('EVENT', '', 'the/topic');
    assert(stubTopic.publishMessage.calledOnce);
  });
});

const createProtobufMessage = app.__get__('createProtobufMessage');
describe('#createProtobufMessage', () => {
  it('should create a Protobuf message that can be validated', async function () {
    const message = await createProtobufMessage(createDownstreamMsg());
    const result = message.toJSON();

    const root = await protobuf.load(
      'src/scaler/scaler-core/downstream.schema.proto',
    );
    const DownstreamEvent = root.lookupType('DownstreamEvent');
    assert.equals(DownstreamEvent.verify(result), null);
  });
});
