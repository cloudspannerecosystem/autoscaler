<br />
<p align="center">
  <h2 align="center">Cloud Spanner Autoscaler</h2>
  <img alt="Spanner Autoscaler" src="https://storage.googleapis.com/gweb-cloudblog-publish/images/Google_Cloud_Spanner_databases.max-2200x2200.jpg">

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

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Configuration parameters](#configuration-parameters)
    *   [Required](#required)
    *   [Optional](#optional)
*   [Metrics parameters](#metrics-parameters)
    *   [Selector](#selector)
    *   [Parameters](#parameters)
*   [Custom thresholds](#custom-thresholds)
*   [Example configuration](#example-configuration)

## Overview

The Poller function takes an array of Cloud Spanner instances from the payload
of a Cloud PubSub message and obtains load metrics for each of them from
[Cloud Monitoring][cloud-monitoring].

Then for each Spanner instance it publishes a message to the specified Cloud
PubSub topic including the metrics and part of the configuration for the Spanner
instance.

The Scaler function will receive the message, compare the metric values with the
[recommended thresholds][spanner-metrics] and if any of the thresholds are
exceeded, the Scaler function will adjust the number of nodes in the Spanner
instance accordingly. Note that the thresholds are different depending if a
Spanner instance is [regional or multi-region][spanner-regional].

## Configuration parameters

The following are the configuration parameters consumed by the Poller function.
Some of these parameters are forwarded to the Scaler function as well.

The parameters are defined using JSON in the payload of the PubSub message that
is published by the Cloud Scheduler job. See the
[configuration section][autoscaler-home-config] in the home page for
instructions on how to change the payload.

### Required

| Key                 | Description
| ------------------- | -----------
| `projectId`         | Project ID of the Cloud Spanner to be monitored by the Autoscaler
| `instanceId`        | Instance ID of the Cloud Spanner to be monitored by the Autoscaler
| `scalerPubSubTopic` | PubSub topic for the Poller function to publish messages for the Scaler function

### Optional

Key                      | Default Value  | Description
------------------------ | -------------- | -----------
`minNodes`               | 1              | Minimum number of Cloud Spanner nodes that the instance can be scaled IN to.
`maxNodes`               | 3              | Maximum number of Cloud Spanner nodes that the instance can be scaled OUT to.
`scalingMethod`          | `STEPWISE`     | Scaling method that should be used. Options are: `STEPWISE`, `LINEAR`, `DIRECT`. See the [scaling methods section][autoscaler-scaler-methods] in the Scaler function page for more information.
`stepSize`               | 2              | Number of nodes that should be added or removed when scaling with the `STEPWISE` method.
`overloadStepSize`       | 5              | Number of nodes that should be added when the Cloud Spanner instance is overloaded, and the `STEPWISE` method is used.
`scaleOutCoolingMinutes` | 5              | Minutes to wait after scaling IN or OUT before a scale OUT event can be processed.
`scaleInCoolingMinutes`  | 30             | Minutes to wait after scaling IN or OUT before a scale IN event can be processed.
`overloadCoolingMinutes` | 5              | Minutes to wait after scaling IN or OUT before a scale OUT event can be processed, when the Spanner instance is overloaded. An instance is overloaded if its High Priority CPU utilization is over 90%.
`stateProjectId`         | `${projectId}` | The project ID where the Autoscaler state will be persisted. By default it is persisted using [Cloud Firestore][cloud-firestore] in the same project as the Spanner instance.
`metrics`                | Array          | Array of objects that can override the values in the metrics used to decide when the Cloud Spanner instance should be scaled IN or OUT. Refer to the [metrics definition table](#metrics-parameters) to see the fields used for defining metrics.

## Metrics parameters

The table describes the objects used to define metrics. These can be provided
in the configuration objects to customize the metrics used to autoscale your
Cloud Spanner instances.

To specify a custom threshold specify the name of the metrics to customize
followed by the parameter values you wish to change. The updated parameters
will be merged with the default metric parameters.

### Selectors

Key                  | Description
---------------------| -----------
`name`               | The unique name of the for the metric to be evaulated. The default metrics are `high_priority_cpu`, `rolling_24_hr` and `storage`.

### Parameters

Key                        | Description
-------------------------- | -----------
`filter`                   | The Cloud Monitoring metrics filter that should be used when querying for data.  This filter needs to include the project and instance_id filters.
`reducer`                  | The reducer specifies how the data points should be aggregated when querying for metrics, typically `REDUCE_SUM`. For more details please refer to [Alert Policies - Reducer][alertpolicy-reducer] documentation.
`aligner`                  | The aligner specifies how the data points should be aligned in the time series, typically `ALIGN_MAX`. For more details please refer to [Alert Policies - Aligner][alertpolicy-aligner] documentation.
`period`                   | Defines the period of time in units of seconds at which aggregation takes place. Typically the period should be 60.
`regional_threshold`       | Threshold that should be use when evaluating if a regional instance needs to be scaled in or out.
`multi_regional_threshold` | Threshold that should be use when evaluating if a multi-regional instance needs to be scaled in or out.

## Custom thresholds

The Cloud Spanner Autoscaler determines the number of nodes to be added or
substracted to an instance based on the
[Spanner recommended thresholds][spanner-metrics] for High Priority CPU, 24 hour
rolling average CPU and Storage utilization metrics.

Google recommends using the provided thresholds unchanged. However, in some
cases you may want to modify these thresholds, for example: if reaching the
threshold triggers an alert to your operations team, you could make the
Autoscaler react to a more conservative threshold to avoid alerts being
triggered.

To modify the recommended thresholds, add the metrics parameter to your
configuration and specify name (`high_priority_cpu`, `rolling_24_hr` and
`storage`) of the metric to be changed and desired `regional_threshold` or
`multi_regional_threshold` for your Cloud Spanner instance.

## Example configuration

```json
[
    {
        "projectId": "my-spanner-project",
        "instanceId": "spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "minNodes": 1,
        "maxNodes": 3,
        "metrics": [
          {
            "name": "high_priority_cpu",
            "regional_threshold": 40
          }
        ]
    },{
        "projectId": "different-project",
        "instanceId": "another-spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "minNodes": 5,
        "maxNodes": 30,
        "scalingMethod": "DIRECT"
    }
]
```

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[cloud-monitoring]: https://cloud.google.com/monitoring
[spanner-metrics]: https://cloud.google.com/spanner/docs/monitoring-cloud#create-alert
[autoscaler-home-config]: ../README.md#configuration
[autoscaler-scaler-methods]: ../scaler/README.md#scaling-methods
[cloud-firestore]: https://cloud.google.com/firestore
[spanner-regional]: https://cloud.google.com/spanner/docs/instances#configuration
[alertpolicy-reducer]: https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies#reducer
[alertpolicy-aligner]: https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies#aligner
