<br />
<p align="center">
  <h2 align="center">Autoscaler tool for Cloud Spanner</h2>
  <img alt="Autoscaler" src="../resources/BlogHeader_Database_3.max-2200x2200.jpg">

  <p align="center">
    Validating editor for Autoscaler configuration.
    <br />
    <a href="../README.md">Home</a>
    ·
    <a href="../src/scaler/README.md">Scaler component</a>
    ·
    <a href="../src/poller/README.md">Poller component</a>
    ·
    <a href="../src/forwarder/README.md">Forwarder component</a>
    ·
    <a href="../terraform/README.md">Terraform configuration</a>
    ·
    <a href="../terraform/README.md#Monitoring">Monitoring</a>
  </p>

## Overview

This directory contains a simple web-based autoscaler config file editor that
validates that the JSON config is correct - both for JSON syntax errors and that
the config has the correct set of parameters and values.

For GKE configurations, a YAML ConfigMap equivalent is displayed below.

While directly editing the YAML configMap for GKE is not supported, you
can paste the configmap into the editor, and it will be converted to JSON for
editing and validation.

## Usage

Build the editor and start the HTTP server on port `8080`:

```sh
npm run start-configeditor-server -- --port 8080
```

Then browse to `http://127.0.0.1:8080/`

## Command line config validation

The JSON and YAML configurations can also be validated using the command line:

```sh
npm install
npm run validateConfigFile -- path/to/config_file
```
