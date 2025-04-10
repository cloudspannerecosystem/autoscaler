<br />
<p align="center">
  <h2 align="center">Autoscaler tool for Cloud Spanner</h2>
  <img alt="Autoscaler" src="../resources/BlogHeader_Database_3.max-2200x2200.jpg">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Set up the Autoscaler using Terraform configuration files
    <br />
    <a href="../README.md">Home</a>
    ·
    <a href="../src/scaler/README.md">Scaler component</a>
    ·
    <a href="../src/poller/README.md">Poller component</a>
    ·
    <a href="../src/forwarder/README.md">Forwarder component</a>
    ·
    Terraform configuration
    ·
    Monitoring
    <br />
    <a href="cloud-functions/README.md">Cloud Run functions</a>
    ·
    <a href="gke/README.md">Google Kubernetes Engine</a>
  </p>

</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Monitoring](#monitoring)
*   [Productionization](#productionization)

## Overview

This directory contains Terraform configuration files to quickly set up the
infrastructure of your Autoscaler.

The Autoscaler can be deployed in two different ways:

*   [Deployment to Cloud Run functions](cloud-functions/README.md): Autoscaler
    components are deployed to [Cloud Run functions][cloudfunctions], with
    [Pub/Sub][pubsub] used for asynchronous messaging between components. Use
    this deployment type for serverless operation, for cross-project
    Autoscaling, and to take maximal advantage of Google Cloud managed
    services.

*   [Deployment to Google Kubernetes Engine (GKE)](gke/README.md): Autoscaler
    components are deployed to [Google Kubernetes Engine (GKE)][gke], with
    Kubernetes-native constructs used for messaging and configuration. Use this
    deployment type if you want to use Kubernetes or cannot use the Google
    Cloud service dependencies in the Cloud Run functions model described above.

## Monitoring

The [monitoring](modules/monitoring) module is an optional module for monitoring,
and creates the following resources.

*   Cloud Monitoring Dashboard: a starter dashboard users could deploy to get
    started. This dashboard has 4 metrics: High CPU utilization, Smoothed CPU
    utilization, Storage utilization and Processing units.

## Productionization

The following steps are recommended for productionizing deployment of the
Autoscaler:

*   Begin by deploying the Autoscaler in Dev/Test environments and progress
    your use of the Autoscaler safely towards your Production environments.
*   Incorporate the relevant portions of the supplied Terraform configuration
    into your own Terraform codebase. You may choose to use the supplied modules
    directly, or select portions of the modules to use in your own projects.
*   Create additional cloud resource deployment pipelines using your CI/CD
    tooling to automate the deployment and lifecycle management of the
    Autoscaler. This should include the cloud resources that are used by
    the Autoscaler, as well as the Autoscaler application components
    themselves, i.e. the Cloud Run functions or container images for the
    [Poller][autoscaler-poller] and [Scaler][autoscaler-scaler] components.
*   Decouple the lifecycle of the Autoscaler components from the
    lifecycles of the Spanner instances being scaled. In particular, it
    should be possible to completely tear down and redeploy all components
    of the Autoscaler without affecting your Spanner instances.
*   Store your Autoscaler configuration files in your source control system,
    along with the Terraform and application codebase.
*   Automate updates to the Autoscaler configuration using a deployment
    pipeline separate from deploying the Autoscaler itself. This will
    allow you to incorporate policy and other checks according to your
    organizational requirements (e.g. change freeze periods), as well as
    decoupling updates to the Autoscaler configuration from updates to the
    Autoscaler itself.
*   Pay particular attention to the management and permissions of the service
    accounts you configure the Autoscaler to use. We recommend assigning
    [minimally permissioned service accounts][sa-permissions].
*   Define [alerts][alerts] to be notified of autoscaling events that may
    affect your platform or your application. You can use
    [log-based-alerts][log-based-alerts] to configure alerts that will
    notify you whenever a specific message appears in the logs.
*   In the case of the [Centralized][centralized] or
    [Distributed][distributed] deployment topologies, consider
    running the Autoscaler components in a dedicated project with tightly
    controlled access.
*   In the case of deployment to [gke][gke], you may choose to incorporate
    addtional security measures, such as [Artifact Analysis][artifact-analysis],
    [Binary Authorization][binary-authorization], and
    [Container Threat Detection][container-threat-detection], to help
    secure your deployment.

[alerts]: https://cloud.google.com/monitoring/alerts
[artifact-analysis]: https://cloud.google.com/artifact-registry/docs/analysis
[autoscaler-poller]: ../src/poller/README.md
[autoscaler-scaler]: ../src/scaler/README.md
[binary-authorization]: https://cloud.google.com/binary-authorization/docs/setting-up
[centralized]: cloud-functions/centralized/README.md
[cloudfunctions]: https://cloud.google.com/functions
[container-threat-detection]: https://cloud.google.com/security-command-center/docs/concepts-container-threat-detection-overview
[distributed]: cloud-functions/distributed/README.md
[gke]: https://cloud.google.com/kubernetes-engine
[log-based-alerts]: https://cloud.google.com/logging/docs/alerting/log-based-alerts
[pubsub]: https://cloud.google.com/pubsub
[sa-permissions]: https://cloud.google.com/iam/docs/service-account-overview#service-account-permissions
