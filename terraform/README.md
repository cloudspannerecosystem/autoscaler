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

[cloudfunctions]: https://cloud.google.com/functions
[gke]: https://cloud.google.com/kubernetes-engine
[pubsub]: https://cloud.google.com/pubsub
