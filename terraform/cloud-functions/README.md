<br />
<p align="center">
  <h2 align="center">Autoscaler tool for Cloud Spanner</h2>
  <img alt="Autoscaler" src="../../resources/BlogHeader_Database_3.max-2200x2200.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Set up the Autoscaler using Terraform configuration files
    <br />
    <a href="../../README.md">Home</a>
    ·
    <a href="../../src/scaler/README.md">Scaler component</a>
    ·
    <a href="../../src/poller/README.md">Poller component</a>
    ·
    <a href="../../src/forwarder/README.md">Forwarder component</a>
    ·
    Terraform configuration
    ·
    Monitoring
    <br />
    Cloud Run functions
    ·
    <a href="../gke/README.md">Google Kubernetes Engine</a>
    <br />
    <a href="per-project/README.md">Per-Project</a>
    ·
    <a href="centralized/README.md">Centralized</a>
    ·
    <a href="distributed/README.md">Distributed</a>
  </p>

</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Architecture](#architecture)
*   [Deployment](#deployment)
*   [Monitoring](#monitoring)

## Overview

This directory contains Terraform configuration files to quickly set up the
infrastructure of your Autoscaler on Cloud Run functions.

## Architecture

![architecture-per-project](../../resources/architecture-per-project.png)

The diagram above shows the components of the Autoscaler and the
interaction flow:

1.  Using [Cloud Scheduler][cloud-scheduler] you define how
    often one or more Spanner instances should be verified. You can define
    separate Cloud Scheduler jobs to check several Spanner instances with
    different schedules, or you can group many instances under a single
    schedule.

2.  At the specified time and frequency, Cloud Scheduler pushes a message into
    the Polling [Cloud Pub/Sub][cloud-pub-sub] topic. The message contains a
    JSON payload with the Autoscaler [configuration parameters](#configuration)
    that you defined for each Spanner instance.

3.  When Cloud Scheduler pushes a message into the Poller topic, an instance of
    the [Poller Cloud Function][autoscaler-poller] is created to handle the
    message.

4.  The Poller function reads the message payload and queries the
    [Cloud Monitoring][cloud-monitoring] API to retrieve the utilization metrics
    for each Spanner instance.

5.  For each instance, the Poller function pushes one message into the Scaling
    Pub/Sub topic. The message payload contains the utilization metrics for the
    specific Spanner instance, and some of its corresponding configuration
    parameters.

6.  For each message pushed into the Scaler topic, an instance of the
    [Scaler Cloud Function][autoscaler-scaler] is created to handle it. \
    Using the chosen [scaling method][scaling-methods] the
    Scaler function compares the Spanner instance metrics against the
    recommended thresholds, plus or minus an [allowed margin][margins]
    and determines if the instance should be scaled, and the number of nodes
    or processiing units that it should be scaled to.

7.  The Scaler function retrieves the time when the instance was last scaled
    from the state data stored in [Cloud Firestore][cloud-firestore] and
    compares it with the current database time.

8.  If the configured cooldown period has passed, then the Scaler function
    requests the Spanner Instance to scale out or in.

Throughout the flow, the Autoscaler writes a step by step summary
of its recommendations and actions to [Cloud Logging][cloud-logging] for
tracking and auditing.

## Deployment

The Autoscaler can be deployed following three different strategies. Choose the
one that is best adjusted to fulfill your technical and operational needs.

*   [Per-Project deployment](per-project/README.md): all the components of the
    Autoscaler reside in the same project as your Spanner
    instances. This deployment is ideal for independent teams who want to self
    manage the configuration and infrastructure of their own Autoscalers. It is
    also a good entry point for testing the Autoscaler capabilities.

*   [Centralized deployment](centralized/README.md): a slight departure from the
    pre-project deployment, where all the components of the Cloud Spanner
    Autoscaler reside in the same project, but the Spanner instances may be
    located in different projects. This deployment is suited for a team managing
    the configuration and infrastructure of several Autoscalers in a central
    place.

*   [Distributed deployment](distributed/README.md): all the components of the
    Autoscaler reside in a single project, with the exception of
    Cloud Scheduler. This deployment is a hybrid where teams who own the Spanner
    instances want to manage only the Autoscaler configuration parameters for
    their instances, but the rest of the Autoscaler infrastructure is managed by
    a central team.

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
        "units": "NODES",
        "minSize": 1,
        "maxSize": 3
    },{
        "projectId": "different-project",
        "instanceId": "another-spanner1",
        "scalerPubSubTopic": "projects/my-spanner-project/topics/spanner-scaling",
        "units": "PROCESSING_UNITS",
        "minSize": 500,
        "maxSize": 3000,
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

Note that in the default configuration, any changes made to the Cloud Scheduler
configuration as described above will be reset by a subsequent Terraform run.
If you would prefer to manage the Cloud Scheduler configuration manually
following its initial creation, i.e. using the Google Cloud Web Console, the
`gcloud` CLI, or any other non-Terraform mechanism, please [see this link]
[cloud-scheduler-lifecycle]. Without this change, the Terraform configuration
will remain the source of truth, and any direct modifications to the Cloud
Scheduler configuration will be reset on the next Terraform run.

## Monitoring

The [monitoring](../modules/monitoring) module is an optional module for monitoring,
and creates the following resources.

*   Cloud Monitoring Dashboard: a starter dashboard users could deploy to get
    started. This dashboard has 4 metrics: High CPU utilization, Smoothed CPU
    utilization, Storage utilization and Processing units.

[autoscaler-poller]: ../../src/poller/README.md
[autoscaler-scaler]: ../../src/scaler/README.md
[cloud-firestore]: https://firebase.google.com/docs/firestore
[cloud-logging]: https://cloud.google.com/logging
[cloud-pub-sub]: https://cloud.google.com/pubsub
[cloud-monitoring]: https://cloud.google.com/monitoring
[cloud-scheduler]: https://cloud.google.com/scheduler
[cloud-scheduler-console]: https://console.cloud.google.com/cloudscheduler
[cloud-scheduler-lifecycle]: ../../terraform/modules/scheduler/main.tf#L67
[json]: https://www.json.org/
[margins]: ../../src/scaler/README.md#margins
[scaling-methods]: ../../src/scaler/README.md#scaling-methods
