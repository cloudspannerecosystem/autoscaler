<br />
<p align="center">
  <h2 align="center">Autoscaler tool for Cloud Spanner</h2>
  <img alt="Autoscaler" src="../resources/BlogHeader_Database_3.max-2200x2200.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Automatically increase or reduce the size of one Spanner instance
    <br />
    <a href="../README.md">Home</a>
    ·
    <a href="../poller/README.md">Poller component</a>
    ·
    Scaler component
    ·
    <a href="../forwarder/README.md">Forwarder component</a>
    ·
    <a href="../terraform/README.md">Terraform configuration</a>
    ·
    <a href="../terraform/README.md#Monitoring">Monitoring</a>
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
    linear [cross multiplication][cross-multiplication]. This way, the new
    number of nodes or processing units is
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
   "metrics":[
      {
         "name":"high_priority_cpu",
         "threshold":65,
         "value":85,
         "margin":15
      },
      {
         "name":"rolling_24_hr",
         "threshold":90,
         "value":70
      },
      {
         "name":"storage",
         "threshold":75,
         "value":80,
      }
   ],
   "currentSize":100,
   "regional":true
}
```

The parameters `minNodes`, `maxNodes` and `currentNodes` are deprecated.

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[spanner-metrics]: https://cloud.google.com/spanner/docs/monitoring-cloud#create-alert
[autoscaler-margins]: ../poller/README.md#margins
[autoscaler-poller-parameters]: ../poller/README.md#configuration-parameters
[spanner-regional]: https://cloud.google.com/spanner/docs/instances#configuration
[directly-proportional]: https://en.wikipedia.org/wiki/Proportionality_(mathematics)#Direct_proportionality
[cross-multiplication]: https://en.wikipedia.org/wiki/Cross-multiplication
