<br />
<p align="center">
  <h2 align="center">Autoscaler tool for Cloud Spanner</h2>
  <img alt="Autoscaler" src="../resources/BlogHeader_Database_3.max-2200x2200.jpg">

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
    *   [Selectors](#selectors)
    *   [Parameters](#parameters)
*   [Custom metrics, thresholds and margins](#custom-metrics-thresholds-and-margins)
    *   [Thresholds](#thresholds)
    *   [Margins](#margins)
    *   [Metrics](#metrics)
*   [Example configuration](#example-configuration)

## Overview

The Poller function takes an array of Cloud Spanner instances from the payload
of a Cloud PubSub message and obtains load metrics for each of them from
[Cloud Monitoring][cloud-monitoring].

Then for each Spanner instance it publishes a message to the specified Cloud
PubSub topic including the metrics and part of the configuration for the Spanner
instance.

The Scaler function will receive the message, compare the metric values with the
[recommended thresholds][spanner-metrics], plus or minus an [allowed margin](#margins),
and if any of the values fall outside of this range, the Scaler function will adjust
the number of nodes in the Spanner instance accordingly. Note that the thresholds
are different depending if a Spanner instance is
[regional or multi-region][spanner-regional].

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
`name`               | A unique name of the for the metric to be evaulated. If you want to override the default metrics, their names are: `high_priority_cpu`, `rolling_24_hr` and `storage`.

### Parameters

When defining a metric for the Autoscaler there are two key components:
thresholds and a [Cloud Monitoring time series metric](time-series-filters)
comprised of a filter, reducer, aligner and period. Having a properly defined
metric is critical to the opertional of the Autoscaler, please refer to
[Filtering and aggregation: manipulating time series](filtering-and-aggregation)
for a complete discussion on building metric filters and aggregating data
points.

Key                        | Default      | Description
-------------------------- | ------------ | -----------
`filter`                   |              | The [Cloud Spanner metric](spanner-metrics) and [filter](time-series-filters) that should be used when querying for data. The Autoscaler will automatically add the filter expressions for [Spanner instance resources, instance id](spanner-filter) and project id.
`reducer`                  | `REDUCE_SUM` | The reducer specifies how the data points should be aggregated when querying for metrics, typically `REDUCE_SUM`. For more details please refer to [Alert Policies - Reducer][alertpolicy-reducer] documentation.
`aligner`                  | `ALIGN_MAX`  | The aligner specifies how the data points should be aligned in the time series, typically `ALIGN_MAX`. For more details please refer to [Alert Policies - Aligner][alertpolicy-aligner] documentation.
`period`                   | 60           | Defines the period of time in units of seconds at which aggregation takes place. Typically the period should be 60.
`regional_threshold`       |              | Threshold used to evaluate if a regional instance needs to be scaled in or out.
`multi_regional_threshold` |              | Threshold used to evaluate if a multi-regional instance needs to be scaled in or out.
`regional_margin`       |      5       | Margin above and below the threshold where the metric value is allowed. If the metric falls outside of the range `[threshold - margin, threshold + margin]`, then the regional instance needs to be scaled in or out.
`multi_regional_margin` |      5       | Margin above and below the threshold where the metric value is allowed. If the metric falls outside of the range `[threshold - margin, threshold + margin]`, then the multi regional instance needs to be scaled in or out.

## Custom metrics, thresholds and margins

The Autoscaler determines the number of nodes to be added or
substracted to an instance based on the
[Spanner recommended thresholds][spanner-metrics] for High Priority CPU, 24 hour
rolling average CPU and Storage utilization metrics.

Google recommends using the provided metrics, thresholds and margins unchanged. However,
in some cases you may want to modify these or use a custom metric,
for example: if reaching the default upper limit triggers an alert to your operations
team, you could make the Autoscaler react to a more conservative threshold to
avoid alerts being triggered.

### Thresholds

To modify the recommended thresholds, add the metrics parameter to your
configuration and specify name (`high_priority_cpu`, `rolling_24_hr` and
`storage`) of the metric to be changed and desired `regional_threshold` or
`multi_regional_threshold` for your Cloud Spanner instance.

### Margins

A margin defines an upper and a lower limit around the threshold. An autoscaling
event will be triggered only if the metric value falls above the upper limit,
or below the lower limit.

The objective of this parameter is to avoid autoscaling events being triggered
for small workload fluctuations around the threshold, thus creating a smoothing
effect in autoscaler actions. The threshold and metric
together define a range `[threshold - margin, threshold + margin]`, where the
metric value is allowed. The smaller the margin, the narrower the range,
resulting in higher probability that an autoscaling event is triggered.

By default, the margin value is `5` for both regional and multi-regional instances.
You can change the default value by specifying `regional_margin`
or `multi_regional_margin` in the metric parameters. Specifying a margin parameter
for a metric is optional.

### Metrics

To create a custom metric, add the metrics parameter to your
configuration specifying the required fields (`name`, `filter`,
`regional_threshold`, `multi_regional_threshold`). The `period`,
`reducer` and `aligner` are defaulted but can also be specified in
the metric definition.

[Cloud Spanner metric](spanner-metrics) and [filter](time-series-filters) that
should be used when querying for data. The Autoscaler will automatically add
the filter expressions for [Spanner instance resources, instance id](spanner-filter)
and project id.

## Example configuration

```json
[
    {
        "projectId": "basic-configuration",
        "instanceId": "another-spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "minNodes": 5,
        "maxNodes": 30,
        "scalingMethod": "DIRECT"
    },{
        "projectId": "custom-threshold",
        "instanceId": "spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "minNodes": 1,
        "maxNodes": 3,
        "metrics": [
          {
            "name": "high_priority_cpu",
            "regional_threshold": 40,
            "regional_margin": 3
          }
        ]
    },{
        "projectId": "custom-metric",
        "instanceId": "another-spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "minNodes": 5,
        "maxNodes": 30,
        "scalingMethod": "LINEAR",
        "metrics": [
          {
            "name": "my_custom_metric",
            "filter": "metric.type=\"spanner.googleapis.com/instance/resource/metric\"",
            "regional_threshold": 40,
            "multi_regional_threshold": 30
          }
        ]
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
[filtering-and-aggregation]: https://cloud.google.com/monitoring/api/v3/aggregation
[time-series-filters]: https://cloud.google.com/monitoring/api/v3/filters#time-series-filter
[spanner-metrics]: https://cloud.google.com/monitoring/api/metrics_gcp#gcp-spanner
[spanner-filter]: https://cloud.google.com/logging/docs/view/query-library#spanner-filters
