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
    <a href="poller/README.md">Poller component</a>
    ·
    <a href="scaler/README.md">Scaler component</a>
  </p>
</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)

## Overview

This directory contains the source code for the two main components of the
autoscaler: the Poller and the Scaler:

*   [Poller](poller/README.md)
*   [Scaler](scaler/README.md)

As well as the Forwarder, which is used in the
[distributed deployment model][distributed-docs]:

*   [Forwarder](forwarder/README.md)

It also contains code and configuration specific to the [unified][unified-docs]
deployment model to [GKE][gke-docs].

[distributed-docs]: ../terraform/cloud-functions/distributed/README.md
[gke-docs]: https://cloud.google.com/kubernetes-engine
[unified-docs]: ../terraform/gke/README.md#deployment-models
