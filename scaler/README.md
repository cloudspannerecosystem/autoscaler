<br />
<p align="center">
  <h2 align="center">Cloud Spanner Autoscaler</h2>
  <img alt="Spanner Autoscaler" src="https://storage.googleapis.com/gweb-cloudblog-publish/images/Google_Cloud_Spanner_databases.max-2200x2200.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Automatically increase or reduce nodes in one Spanner instance
    <br />
    <a href="../README.md">Home</a>
    ·
    <a href="../poller/README.md">Poller function</a>
    ·
    Scaler function
    ·
    <a href="../forwarder/README.md">Forwarder function</a>
    ·
    <a href="../terraform/README.md">Terraform configuration</a>
  </p>
</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Scaling methods](#scaling-methods)
    *   [Custom scaling methods](#custom-scaling-methods)
*   [Parameters](#parameters)

## Overview

The Scaler function receives a message from the Poller function that includes
the utilization metrics for a single Spanner instance. It compares the metric
values with the [recommended thresholds][spanner-metrics] and if any of the
thresholds are exceeded, the Scaler function will adjust the number of nodes in
the Spanner instance accordingly.

## Scaling methods

The Scaler function supports three scaling methods out of the box: *
[STEPWISE](scaling-methods/stepwise.js): This is the default method used by the
Scaler. It suggests adding or removing nodes using fixed step amount defined by
the parameter `stepSize`. In an overload situation, when the instance High
Priority CPU utilization is over 90%, the Scaler uses the `overloadStepSize`
parameter instead.

*   [LINEAR](scaling-methods/linear.js): This method suggests adding or removing
    nodes calculated with a simple linear
    [cross multiplication][cross-multiplication]. This way, the new number of
    nodes is [directly proportional][directly-proportional] to the current
    resource utilization.

*   [DIRECT](scaling-methods/direct.js): This method suggests scaling to the
    number of nodes specified by the `maxNodes` parameter. It does NOT take in
    account the current utilization metrics. It is useful to scale an instance
    in preparation for a batch job and and to scale it back after the job is
    finished.

### Custom scaling methods

You can define you own scaling method by creating a new file in the
`scaling-methods` directory. Your file must export a `calculateNumNodes`
function that receives an object and returns an integer. The input object
contains the message payload received from the Poller function. See
[more information](#parameters) about the message payload.

```js
exports.calculateNumNodes = (spanner) => {
  console.log('---- MY_METHOD node suggestions for ' + spanner.projectId + "/" + spanner.instanceId + '----');
  //...
  return 42;
 }
```

## Parameters

As opposed to the Poller function, the Scaler function does not need any user
configuration. The parameters that the Scaler receives are a subset of the
[configuration parameters][autoscaler-poller-parameters] used by the Poller
function.

The messages sent to the Scaler function from the Poller function include this
subset, the Spanner instance metrics, the current number of nodes and a flag to
indicate if the Spanner instance is
[regional or multi-regional][spanner-regional].

The following is an example:

```json
{
   "minNodes":1,
   "maxNodes":3,
   "stepSize":1,
   "overloadStepSize":5,
   "scaleOutCoolingMinutes":5,
   "scaleInCoolingMinutes":30,
   "scalingMethod":"STEPWISE",
   "projectId":"my-spanner-project",
   "instanceId":"spanner1",
   "scalerPubSubTopic":"projects/my-spanner-project/topics/spanner-scaling",
   "metrics":[
      {
         "name":"high_priority_cpu",
         "threshold":65,
         "value":95
      },
      {
         "name":"rolling_24_hr",
         "threshold":90,
         "value":80
      },
      {
         "name":"storage",
         "threshold":75,
         "value":80
      }
   ],
   "currentNodes":1,
   "regional":true
}
```

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[spanner-metrics]: https://cloud.google.com/spanner/docs/monitoring-cloud#create-alert
[autoscaler-poller-parameters]: ../poller/README.md#configuration-parameters
[spanner-regional]: https://cloud.google.com/spanner/docs/instances#configuration
[directly-proportional]: https://en.wikipedia.org/wiki/Proportionality_(mathematics)#Direct_proportionality
[cross-multiplication]: https://en.wikipedia.org/wiki/Cross-multiplication
