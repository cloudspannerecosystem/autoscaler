<br />
<p align="center">
  <h2 align="center">Cloud Spanner Autoscaler</h2>
  <img alt="Spanner Autoscaler" src="https://storage.googleapis.com/gweb-cloudblog-publish/images/Google_Cloud_Spanner_databases.max-2200x2200.jpg">

  <p align="center">
    An open source tool to autoscale Spanner instances
    <br />
    Home
    ·
    <a href="poller/README.md">Poller function</a>
    ·
    <a href="scaler/README.md">Scaler function</a>
    ·
    <a href="forwarder/README.md">Forwarder function</a>
    ·
    <a href="terraform/README.md">Terraform configuration</a>
  </p>
</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Architecture](#architecture)
*   [Deployment](#deployment)
*   [Configuration](#configuration)
*   [Licensing](#licensing)
*   [Contributing](#contributing)

## Overview

The Cloud Spanner Autoscaler is a companion tool to Cloud Spanner that allows
you to automatically increase or reduce the number of nodes in one or more
Spanner instances, based on their utilization.

When you create a [Cloud Spanner instance][spanner-instance], you choose the
number of nodes that provide compute resources for the instance. As the
instance's workload changes, Cloud Spanner does *not* automatically adjust the
number of nodes in the instance.

The Cloud Spanner Autoscaler monitors your instances and automatically adds or
removes nodes to ensure that they stay within the
[recommended maximums for CPU utilization][spanner-max-cpu] and the
[recommended limit for storage per node][spanner-max-storage]. Note that the
recommended thresholds are different depending if a Spanner instance is
[regional or multi-region][spanner-regional].

## Architecture

![architecture-per-project](resources/architecture-per-project.png)

The diagram above shows the components of the Cloud Spanner Autoscaler and the
interaction flow: 1. Using [Cloud Scheduler][cloud-scheduler] you define how
often one or more Spanner instances should be verified. You can define separate
Cloud Scheduler jobs to check several Spanner instances with different
schedules, or you can group many instances under a single schedule.

1.  At the specified time and frequency, Cloud Scheduler pushes a message into
    the Polling [Cloud Pub/Sub][cloud-pub-sub] topic. The message contains a
    JSON payload with the autoscaler [configuration parameters](#configuration)
    that you defined for each Spanner instance.

2.  When Cloud Scheduler pushes a message into the Poller topic, an instance of
    the [Poller Cloud Function][autoscaler-poller] is created to handle the
    message.

3.  The Poller function reads the message payload and queries the
    [Cloud Monitoring][cloud-monitoring] API to retrieve the utilization metrics
    for each Spanner instance.

4.  For each instance, the Poller function pushes one message into the Scaling
    Pub/Sub topic. The message payload contains the utilization metrics for the
    specific Spanner instance, and some of its corresponding configuration
    parameters.

5.  For each message pushed into the Scaler topic, an instance of the
    [Scaler Cloud Function][autoscaler-scaler] is created to handle it. \
    Using the chosen [scaling method](scaler/README.md#scaling-methods), the
    Scaler function compares the Spanner instance metrics against the
    recommended thresholds and determines if the instance should be scaled, and
    the number of nodes that it should be scaled to.

6.  The Scaler function retrieves the time when the instance was last scaled
    from the state data stored in [Cloud Firestore][cloud-firestore] and
    compares it with the current database time.

7.  If the configured cooldown period has passed, then the Scaler function
    requests the Spanner Instance to scale out or in.

Throughout the flow, the Cloud Spanner Autoscaler writes a step by step summary
of its recommendations and actions to [Cloud Logging][cloud-logging] for
tracking and auditing.

## Deployment

To deploy the Cloud Spanner Autoscaler, decide which of the following strategies
is best adjusted to fulfill your technical and operational needs.

*   [Per-Project deployment](terraform/per-project/README.md): all the
    components of the Cloud Spanner Autoscaler reside in the same project as
    your Spanner instances. This deployment is ideal for independent teams who
    want to self manage the configuration and infrastructure of their own
    Autoscalers. It is also a good entry point for testing the Autoscaler
    capabilities.

*   [Centralized deployment](terraform/centralized/README.md): a slight
    departure from the pre-project deployment, where all the components of the
    Cloud Spanner Autoscaler reside in the same project, but the Spanner
    instances may be located in different projects. This deployment is suited
    for a team managing the configuration and infrastructure of several
    Autoscalers in a central place.

*   [Distributed deployment](terraform/distributed/README.md): all the
    components of the Cloud Spanner Autoscaler reside in a single project, with
    the exception of Cloud Scheduler. This deployment is a hybrid where teams
    who own the Spanner instances want to manage only the Autoscaler
    configuration parameters for their instances, but the rest of the Autoscaler
    infrastructure is managed by a central team.

To deploy the Autoscaler infrastructure follow the instructions in the link for
the chosen strategy.

## Configuration

After deploying the Autoscaler, you are ready to configure its parameters.

1.  Open the [Cloud Scheduler console page][cloud-scheduler-console].

2.  Select the checkbox next to the name of the job created by the Autoscaler
    deployment: `poll-main-instance-metrics`

3.  Click on **Edit** on the top bar.

4.  Modify the Autoscaler parameters shown in the job payload. <br />
    The following is an example:

```json
[
    {
        "projectId": "my-spanner-project",
        "instanceId": "spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "minNodes": 1,
        "maxNodes": 3
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

The payload is defined using a [JSON][json] array. Each element in the array
represents a Spanner instance that will share the same Autoscaler job schedule.

Additionally, a single instance can have multiple Autoscaler configurations in
different job schedules. This is useful for example if you want to have an
instance configured with the linear method for normal operations, but also have
another Autoscaler configuration with the direct method for planned batch
workloads.

You can find the details about the parameters and their default values in the
[Poller component page][autoscaler-poller].

1.  Click on **Update** at the bottom to save the changes.

The Autoscaler is now configured and will start monitoring and scaling your
instances in the next scheduled job run.

## Licensing

```lang-none
Copyright 2020 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## Contributing

*   [Contributing guidelines][contributing-guidelines]
*   [Code of conduct][code-of-conduct]

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[spanner-instance]: https://cloud.google.com/spanner/docs/instances
[spanner-max-cpu]: https://cloud.google.com/spanner/docs/cpu-utilization#recommended-max
[spanner-max-storage]: https://cloud.google.com/spanner/docs/monitoring-cloud#storage
[cloud-scheduler]: https://cloud.google.com/scheduler
[cloud-pub-sub]: https://cloud.google.com/pubsub
[cloud-functions]: https://cloud.google.com/functions
[cloud-monitoring]: https://cloud.google.com/monitoring
[cloud-firestore]: https://cloud.google.com/firestore
[cloud-logging]: https://cloud.google.com/logging
[autoscaler-poller]: poller/README.md
[autoscaler-scaler]: scaler/README.md
[autoscaler-per-project]: terraform/per-project/README.md
[autoscaler-distributed]: terraform/distributed/README.md
[contributing-guidelines]: contributing.md
[code-of-conduct]: code-of-conduct.md
[cloud-scheduler-console]: https://console.cloud.google.com/cloudscheduler/
[json]: https://www.json.org/json-en.html
[spanner-regional]: https://cloud.google.com/spanner/docs/instances#configuration
