<br />
<p align="center">
  <h2 align="center">Cloud Spanner Autoscaler</h2>
  <img src="https://storage.googleapis.com/gweb-cloudblog-publish/images/Google_Cloud_Spanner_databases.max-2200x2200.jpg" alt="Spanner Autoscaler">

  <p align="center">
    <!-- In one sentence: what does the code in this directory do? -->
    Set up the Cloud Spanner Autoscaler using Terraform configuration files
    <br />
    <a href="../README.md">Home</a>
    ·
    <a href="../scaler/README.md">Scaler function</a>
    ·
    <a href="../poller/README.md">Poller function</a>
    ·
    <a href="../forwarder/README.md">Forwarder function</a>
    ·
    Terraform configuration
    <br />
    <a href="per-project/README.md">Per-Project</a>
    ·
    <a href="centralized/README.md">Centralized</a>
    ·
    <a href="distributed/README.md">Distributed</a>
  </p>

</p>

## Table of Contents

-   [Table of Contents](#table-of-contents)
-   [Overview](#overview)

## Overview

This directory contains Terraform configuration files to quickly set up the
infrastructure of your Cloud Spanner Autoscaler.

The Cloud Spanner Autoscaler can be deployed following three different
strategies. Choose the one that is best adjusted to fulfill your technical and
operational needs.

*   [Per-Project deployment](per-project/README.md): all the components of the
    Cloud Spanner Autoscaler reside in the same project as your Spanner
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
    Cloud Spanner Autoscaler reside in a single project, with the exception of
    Cloud Scheduler. This deployment is a hybrid where teams who own the Spanner
    instances want to manage only the Autoscaler configuration parameters for
    their instances, but the rest of the Autoscaler infrastructure is managed by
    a central team
