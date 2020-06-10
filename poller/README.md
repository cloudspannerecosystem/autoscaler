<br />
<p align="center">
  <h2 align="center">Cloud Spanner Autoscaler</h2>
  <img src="https://storage.googleapis.com/gweb-cloudblog-publish/images/Google_Cloud_Spanner_databases.max-2200x2200.jpg" alt="Spanner Autoscaler">


  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Retrieve metrics for one or more Cloud Spanner Instances
    <br />
    <a href="../README.md">Home</a>
    ·
    Poller function
    ·
    <a href="../scaler/README.md">Scaler function</a>
    ·
    <a href="../forwarder/README.md">Forwarder function</a>
    ·
    <a href="../terraform/README.md">Terraform configuration</a>
  </p>
</p>

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Overview](#overview)
- [Configuration parameters](#configuration-parameters)
  - [Required](#required)
  - [Optional](#optional)
- [Custom Thresholds](#custom-thresholds)

## Overview

The Poller function takes an array of Cloud Spanner instances from the payload of a Cloud PubSub message and obtains load metrics for each of them from [Cloud Monitoring][cloud-monitoring].

Then for each Spanner instance it publishes a message to the specified Cloud PubSub topic including the metrics and part of the configuration for the Spanner instance. 

The Scaler function will receive the message, compare the metric values with the [recommended thresholds][spanner-metrics] and if any of the thresholds are exceeded, the Scaler function will adjust the number of nodes in the Spanner instance accordingly. Note that the thresholds are different depending if a Spanner instance is [regional or multi-region][spanner-regional].

## Configuration parameters

The following are the configuration parameters consumed by the Poller function. Some of these parameters are forwarded to the Scaler function as well.

The parameters are defined using JSON in the payload of the PubSub message that is published by the Cloud Scheduler job. See the [configuration section][autoscaler-home-config] in the home page for instructions on how to change the payload.

### Required
| Key                 | Description                                                        |
|---------------------|--------------------------------------------------------------------|
| `projectId`         | Project ID of the Cloud Spanner to be monitored by the Autoscaler  |
| `instanceId`        | Instance ID of the Cloud Spanner to be monitored by the Autoscaler |
| `scalerPubSubTopic` | PubSub topic for the Poller function to publish messages for the Scaler function  |

### Optional

| Key                      | Default Value | Description                                                                         |
|--------------------------|---------------|-------------------------------------------------------------------------------------|
| `minNodes`               | 1             | Minimum number of Cloud Spanner nodes that the instance can be scaled IN to.
| `maxNodes`               | 3             | Maximum number of Cloud Spanner nodes that the instance can be scaled OUT to.                    |
| `scalingMethod`          | `STEPWISE`    | Scaling method that should be used. Options are: `STEPWISE`, `LINEAR`, `DIRECT`. <br /> See the [scaling methods section][autoscaler-scaler-methods] in the Scaler function page for more information.     |
| `stepSize`               | 2             | Number of nodes that should be added or removed when scaling with the `STEPWISE` method. 
| `overloadStepSize`       | 5             | Number of nodes that should be added when the Cloud Spanner instance is overloaded, and the `STEPWISE` method is used. |
| `scaleOutCoolingMinutes` | 5             | Minutes to wait after scaling IN or OUT before a scale OUT event can be processed.          |
| `scaleInCoolingMinutes`  | 30            | Minutes to wait after scaling IN or OUT before a scale IN event can be processed.           |
| `overloadCoolingMinutes` | 5             | Minutes to wait after scaling IN or OUT before a scale OUT event can be processed, when the Spanner instance is overloaded.<br/> An instance is overloaded if its High Priority CPU utilization is over 90%. |
| `stateProjectId`         | `${projectId}`| The project ID where the Autoscaler state will be persisted. <br /> By default it is persisted using [Cloud Firestore][cloud-firestore] in the same project as the Spanner instance.                       |

## Custom Thresholds

The Cloud Spanner Autoscaler determines the number of nodes to be added or substracted to an instance based on the [Spanner recommended thresholds][spanner-metrics] for High Priority CPU, 24 hour rolling average CPU and Storage utilization metrics.

Google recommends using the provided thresholds unchanged. However, in some cases you may want to modify these thresholds, for example: if reaching the threshold triggers an alert to your operations team, you could make the Autoscaler react to a more conservative threshold to avoid alerts being triggered.

To modify the recommended thresholds, change the following properties in the [Poller function metrics definition](../poller/index.js):

```js
   {  ...,
      regional_threshold: X,
      multi_regional_threshold: Y 
   }
```

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[cloud-monitoring]: https://cloud.google.com/monitoring
[spanner-metrics]: https://cloud.google.com/spanner/docs/monitoring-cloud#create-alert
[autoscaler-home-config]: ../README.md#configuration
[autoscaler-scaler-methods]: ../scaler/README.md#scaling-methods
[cloud-firestore]: https://cloud.google.com/firestore
[spanner-regional]: https://cloud.google.com/spanner/docs/instances#configuration