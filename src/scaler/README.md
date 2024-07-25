<br />
<p align="center">
  <h2 align="center">Autoscaler tool for Cloud Spanner</h2>
  <img alt="Autoscaler" src="../../resources/BlogHeader_Database_3.max-2200x2200.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Automatically increase or reduce the size of one Spanner instance
    <br />
    <a href="../../README.md">Home</a>
    ·
    <a href="../poller/README.md">Poller component</a>
    ·
    Scaler component
    ·
    <a href="../forwarder/README.md">Forwarder component</a>
    ·
    <a href="../../terraform/README.md">Terraform configuration</a>
    ·
    <a href="../../terraform/README.md#Monitoring">Monitoring</a>
  </p>
</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Scaling methods](#scaling-methods)
    *   [Custom scaling methods](#custom-scaling-methods)
*   [Parameters](#parameters)

## Overview

The Scaler component receives a message from the Poller component that includes
the utilization metrics for a single Spanner instance. It compares the metric
values with the [recommended thresholds][spanner-metrics], plus or minus an
[allowed margin][autoscaler-margins]. The Scaler component determines
if the instance should be scaled, the number of nodes or processing units
it should be scaled to, and adjusts the size of the Spanner instance accordingly.

## Scaling methods

The Scaler component supports three scaling methods out of the box:

*   [STEPWISE](scaler-core/scaling-methods/stepwise.js): This is the default
    method used by the Scaler. It suggests adding or removing nodes or
    processing units using a fixed step amount defined by the parameter
    `stepSize`. In an overload situation, when the instance High Priority CPU
    utilization is over 90%, the Scaler uses the `overloadStepSize` parameter
    instead.

*   [LINEAR](scaler-core/scaling-methods/linear.js): This method suggests
    adding or removing nodes or processing units calculated with a simple
    linear [cross multiplication][cross-multiplication].
    In other words, the new number of processing units divided by the max
    number of processing units is equal to the metric value divided by the
    metric threshold value.
    Using this method, the new number of nodes or processing units is
    [directly proportional][directly-proportional] to the current resource
    utilization.

*   [DIRECT](scaler-core/scaling-methods/direct.js): This method suggests
    scaling to the number of nodes or processing units specified by the
    `maxSize` parameter. It does NOT take in account the current utilization
    metrics. It is useful to scale an instance in preparation for a batch job
    and and to scale it back after the job is finished.

### Custom scaling methods

You can define you own scaling method by creating a new file in the
`scaling-methods` directory. Your file must export a `calculateSize`
function that receives an object and returns an integer. The input object
contains the message payload received from the Poller component. See
[more information](#parameters) about the message payload.

```js
exports.calculateSize = (spanner) => {
  console.log('---- MY_METHOD suggestions for ' + spanner.projectId + "/" + spanner.instanceId + '----');
  //...
  return 400;
 }
```

The function `calculateNumNodes` is deprecated.

## Parameters

As opposed to the Poller component, the Scaler component does not need any user
configuration. The parameters that the Scaler receives are a subset of the
[configuration parameters][autoscaler-poller-parameters] used by the Poller
component.

The messages sent to the Scaler component from the Poller component include this
subset, the Spanner instance metrics, the current size in number of nodes or
processing units and a flag to indicate if the Spanner instance is
[regional or multi-regional][spanner-regional].

The following is an example:

```json
{
   "units":"PROCESSING_UNITS",
   "minSize":100,
   "maxSize":2000,
   "stepSize":200,
   "overloadStepSize":500,
   "scaleOutCoolingMinutes":5,
   "scaleInCoolingMinutes":30,
   "scalingMethod":"STEPWISE",
   "projectId":"my-spanner-project",
   "instanceId":"spanner1",
   "scalerPubSubTopic":"projects/my-spanner-project/topics/spanner-scaling",
   "downstreamPubSubTopic":"projects/my-spanner-project/topics/downstream-topic",
   "metrics":[
      {
         "name":"high_priority_cpu",
         "threshold":65,
         "value":85.764282783144476,
         "margin":15
      },
      {
         "name":"rolling_24_hr",
         "threshold":90,
         "value":70.105833476200979
      },
      {
         "name":"storage",
         "threshold":75,
         "value":21.980773510634042,
      }
   ],
   "currentSize":100,
   "currentNumDatabases": 10,
   "regional":true
}
```

The parameters `minNodes`, `maxNodes` and `currentNodes` are deprecated.

## Downstream messaging

A downstream application is a system that receives information from the
Autoscaler.

When a certain event happens, the Autoscaler can publish messages to a
PubSub topic. Downstream applications can
[create a subscription][pub-sub-create-subscription] to that topic
and [pull the messages][pub-sub-receive] to process them further.

This feature is disabled by default. To enable it, specify `projects/${projectId}/topics/downstream-topic`
as the value of the `downstreamPubSubTopic` parameter in the [Poller configuration](../poller/README.md#configuration-parameters).
Make sure you replace the placeholder `${projectId}` with your actual project ID.

The topic is created at deployment time as specified in the
[base module Terraform config](../../terraform/modules/autoscaler-base/main.tf).

### Message structure

The following is an example of a message published by the Autoscaler.

```json
[
  {
    "ackId": "U0RQBhYsXUZIUTcZCGhRDk9eIz81IChFEQMIFAV8fXFDRXVeXhoHUQ0ZcnxpfT5TQlUBEVN-VVsRDXptXG3VzfqNRF9BfW5ZFAgGQ1V7Vl0dDmFeWF3SjJ3whoivS3BmK9OessdIf77en9luZiA9XxJLLD5-LSNFQV5AEkwmFkRJUytDCypYEU4EISE-MD5F",
    "ackStatus": "SUCCESS",
    "message": {
      "attributes": {
        "event": "SCALING",
        "googclient_schemaencoding": "JSON",
        "googclient_schemaname": "projects/my-spanner-project/schemas/downstream-schema",
        "googclient_schemarevisionid": "207c0c97"
      },
      "data": "eyJwcm9qZWN0SWQiOiJteS1zcGFubmVyLXByb2plY3QiLCJpbnN0YW5jZUlkIjoiYXV0b3NjYWxlLXRlc3QiLCJjdXJyZW50U2l6ZSI6MTAwLCJzdWdnZXN0ZWRTaXplIjozMDAsInVuaXRzIjoxLCJtZXRyaWNzIjpbeyJuYW1lIjoiaGlnaF9wcmlvcml0eV9jcHUiLCJ0aHJlc2hvbGQiOjY1LCJ2YWx1ZSI6ODUsIm1hcmdpbiI6MTV9LHsibmFtZSI6InJvbGxpbmdfMjRfaHIiLCJ0aHJlc2hvbGQiOjkwLCJ2YWx1ZSI6NzAsIm1hcmdpbiI6NX0seyJuYW1lIjoic3RvcmFnZSIsInRocmVzaG9sZCI6NzUsInZhbHVlIjo4MCwibWFyZ2luIjo1fV19",
      "messageId": "8437946659663924",
      "publishTime": "2023-06-20T16:39:49.252Z"
    }
  }
]
```

Notable attributes are:

*   **message.attributes.event:** the name of the event for which this message
    was triggered. The Autoscaler publishes a message when it scales a Spanner
    instance. The name of that event is `'SCALING'`. You can define
    [custom messages](#custom-messages) for your own event types.
*   **message.attributes.googclient_schemaname:** the
    [Pub/Sub schema][pub-sub-schema] defining the format that the data field
    must follow. The schema represents the contract between the message
    producer (Autoscaler) and the message consumers (downstream applications).
    Pub/Sub enforces the format. The default schema is defined as a Protocol
    Buffer in the file
    [downstream.schema.proto](scaler-core/downstream.schema.proto).
*   **message.attributes.googclient_schemaencoding:** consumers will receive
    the data in the messages encoded as Base64 containing JSON.
*   **message.publishTime:** timestamp when the message was published
*   **message.data:** the message payload encoded as Base64 containing a JSON
    string. In the example, the [decoded][base-64-decode] string contains the
    following data:

```json
{
   "projectId":"my-spanner-project",
   "instanceId":"autoscale-test",
   "currentSize":100,
   "suggestedSize":300,
   "units":"PROCESSING_UNITS",
   "metrics":[
      {
         "name":"high_priority_cpu",
         "threshold":65,
         "value":85.764282783144476,
         "margin":15
      },
      {
         "name":"rolling_24_hr",
         "threshold":90,
         "value":70.105833476200979,
         "margin":5
      },
      {
         "name":"storage",
         "threshold":75,
         "value":21.980773510634042,
         "margin":5
      }
   ]
}
```

The thresholds and margins already correspond to the regional or
multi-region values depending on your
[Spanner instance configuration][regional-multi-regional].

### Custom messages

Before defining a custom message, consider if your use case can be solved by
[log-based metrics][log-based-metrics].

The Spanner Autoscaler produces verbose structured logging for all its actions.
These logs can be used through log-based metrics to create [charts and alerts in
Cloud Monitoring][charts-and-alerts]. In turn, alerts can be notified through
several different [channels][notification-channels] including Pub/Sub, and
managed through [incidents][alert-incidents].

If your use case can be better solved by a custom downstream message, then this
section explains how to define one, which implies modifying the Scaler code.

To publish a new event as a downstream message:

*   Choose a unique name for your event. The convention is an all-caps
    alphanumeric + underscores ID with a verb. e.g. `'SCALING'`
*   Call the Scaler function `publishDownstreamEvent`.
    For an example, look at the [Scaler](scaler-core/index.js)
    function `processScalingRequest`.

In case you need to add fields to the message payload:

1.  Add your custom fields to the [Pub/Sub schema protobuf](scaler-core/downstream.schema.proto).
    Your custom fields must use [field numbers][proto-field-numbers] over 1000.
    Field numbers from 1 to 1000 are [reserved][proto-reserved] for future
    Autoscaler enhancements. Make sure field numbers are unique within your org
    and not reused if previously deleted.

2.  Run `terraform apply` to update the downstream Pub/Sub topic with the new schema.

3.  Create and call a function similar to the [Scaler](scaler-core/index.js)
    `publishDownstreamEvent()`. In this function you populate the message
    payload with the default fields and your new custom fields, and then call
    `publishProtoMsgDownstream()`.

### Consuming messages

The payload of messages sent downstream from the Autoscaler is plain JSON encoded
with Base64, so you do not need to use the protobuf library for receiving messages.
See [this article][pub-sub-receive] for an example.

However, if you want to validate the received message against the Protobuf schema,
you can follow [this example][pub-sub-receive-proto].

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[spanner-metrics]: https://cloud.google.com/spanner/docs/monitoring-cloud#create-alert
[autoscaler-margins]: ../poller/README.md#margins
[autoscaler-poller-parameters]: ../poller/README.md#configuration-parameters
[spanner-regional]: https://cloud.google.com/spanner/docs/instances#configuration
[directly-proportional]: https://en.wikipedia.org/wiki/Proportionality_(mathematics)#Direct_proportionality
[cross-multiplication]: https://github.com/cloudspannerecosystem/autoscaler/blob/main/src/scaler/scaler-core/scaling-methods/linear.js#L56
[pub-sub-schema]: https://cloud.google.com/pubsub/docs/schemas
[base-64-decode]: https://www.base64decode.org/
[log-based-metrics]: https://cloud.google.com/logging/docs/logs-based-metrics
[charts-and-alerts]: https://cloud.google.com/logging/docs/logs-based-metrics#monitoring
[notification-channels]: https://cloud.google.com/monitoring/support/notification-options
[alert-incidents]: https://cloud.google.com/monitoring/alerts/log-based-incidents
[proto-field-numbers]: https://protobuf.dev/programming-guides/proto3/#assigning
[proto-reserved]: https://protobuf.dev/programming-guides/proto3/#fieldreserved
[pub-sub-receive]: https://cloud.google.com/pubsub/docs/publish-receive-messages-client-library#receive_messages
[pub-sub-receive-proto]: https://cloud.google.com/pubsub/docs/samples/pubsub-subscribe-proto-messages#pubsub_subscribe_proto_messages-nodejs_javascript
[pub-sub-create-subscription]: https://cloud.google.com/pubsub/docs/create-subscription#pubsub_create_push_subscription-nodejs
[regional-multi-regional]: https://cloud.google.com/spanner/docs/instance-configurations
