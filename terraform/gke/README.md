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
    <a href="../README.md#Monitoring">Monitoring</a>
    <br />
    <a href="../cloud-functions/README.md">Cloud Functions</a>
    ·
    Google Kubernetes Engine
  </p>

</p>

## Table of Contents

*   [Table of Contents](#table-of-contents)
*   [Overview](#overview)
*   [Architecture](#architecture)
    *   [Pros](#pros)
    *   [Cons](#cons)
*   [Before you begin](#before-you-begin)
*   [Preparing the Autoscaler Project](#preparing-the-autoscaler-project)
    *   [Using Firestore for Autoscaler state](#using-firestore-for-autoscaler-state)
    *   [Using Spanner for Autoscaler state](#using-spanner-for-autoscaler-state)
*   [Creating Autoscaler infrastructure](#creating-autoscaler-infrastructure)
*   [Importing your Spanner instances](#importing-your-spanner-instances)
*   [Building the Autoscaler](#building-the-autoscaler)
    *   [Building the Autoscaler for a unified deployment model](#building-the-autoscaler-for-a-unified-deployment-model)
    *   [Building the Autoscaler for a decoupled deployment model](#building-the-autoscaler-for-a-decoupled-deployment-model)
*   [Deploying the Autoscaler](#deploying-the-autoscaler)
*   [Metrics in GKE deployment](#metrics-in-gke-deployment)
*   [Troubleshooting](#troubleshooting)

## Overview

This directory contains Terraform configuration files to quickly set up the
infrastructure for your Autoscaler for a deployment to
[Google Kubernetes Engine (GKE)][gke].

In this deployment option, all the components of the Autoscaler reside in the
same project as your [Spanner][spanner] instances. A future enhancement may
enable the autoscaler to operate cross-project when running in GKE.

This deployment is ideal for independent teams who want to self-manage the
infrastructure and configuration of their own Autoscalers on Kubernetes.

## Architecture

![architecture-gke][architecture-gke]

1.  Using a [Kubernetes ConfigMap][kubernetes-configmap] you define which
    Spanner instances you would like to be managed by the autoscaler. Currently
    these must be in the same project as the cluster that runs the autoscaler.

2.  Using a [Kubernetes CronJob][kubernetes-cronjob], the autoscaler is
    configured to run on a schedule. By default this is every two minutes,
    though this is configurable.

3.  When scheduled, an instance of the [Poller][autoscaler-poller]
    is created as a [Kubernetes Job][kubernetes-job].

4.  The Poller queries the [Cloud Monitoring][cloud-monitoring] API to retrieve
    the utilization metrics for each Spanner instance.

5.  For each Spanner instance, the Poller makes a call to the Scaler via its
    API. The request payload contains the utilization metrics for the specific
    Spanner instance, and some of its corresponding configuration parameters.

6.  Using the chosen [scaling method][scaling-methods]
    the Scaler compares the Spanner instance metrics against the recommended
    thresholds, plus or minus an [allowed margin][margins] and determines
    if the instance should be scaled, and the number of nodes or processing units
    that it should be scaled to.

7.  The Scaler retrieves the time when the instance was last scaled from the
    state data stored in [Cloud Firestore][cloud-firestore] (or alternatively
    [Spanner][spanner]) and compares it with the current time.

8.  If the configured cooldown period has passed, then the Scaler requests the
    Spanner Instance to scale out or in.

9.  Both Poller and Scaler publish counters to an [OpenTelemetry Collector][otel-collector],
    also running in Kubernetes, which is configured to forward these counters to
    [Google Cloud Monitoring][gcm-docs]. See section
    [Metrics in GKE deployment](#metrics-in-gke-deployment)

The GKE deployment has the following pros and cons:

### Pros

*   **Kubernetes-based**: For teams that may not be able to use Google Cloud
    services such as [Cloud Functions][cloud-functions], this design enables
    the use of the autoscaler.
*   **Configuration**: The control over scheduler parameters belongs to the team
    that owns the Spanner instance, therefore the team has the highest degree of
    freedom to adapt the Autoscaler to its needs.
*   **Infrastructure**: This design establishes a clear boundary of
    responsibility and security over the Autoscaler infrastructure because the
    team owner of the Spanner instances is also the owner of the Autoscaler
    infrastructure.

### Cons

*   **Infrastructure**: In contrast to the [Cloud Functions][cloud-functions]
    design, some long-lived infrastructure and services are required.
*   **Maintenance**: with each team being responsible for the Autoscaler
    configuration and infrastructure it may become difficult to make sure that
    all Autoscalers across the company follow the same update guidelines.
*   **Audit**: because of the high level of control by each team, a centralized
    audit may become more complex.

## Further options for GKE deployment

For deployment to GKE there are two further options to choose from:

1.  Deployment of decoupled Poller and Scaler components, running in separate pods.

2.  Deployment of a unified Autoscaler, with Poller and Scaler components
    combined.

The decoupled deployment model has the advantage that Poller and Scaler
components can be assigned individual permissions (i.e. run as separate service
accounts), and the two components can be managed and scaled as required to suit
your needs. However, this deployment model relies on the Scaler component being
deployed as a long-running service, which consumes resources.

In contrast, the unified deployment model has the advantage that the Poller and
Scaler components can be deployed as a single pod, which runs as a Kubernetes
cron job. This means there are no long-running components. As well as this,
with Poller and Scaler components combined, only a single service account is
required.

For most use cases, the unified deployment model is recommended.

## Before you begin

In this section you prepare your environment.

1.  Open the [Cloud Console][cloud-console]
2.  Activate [Cloud Shell][cloud-shell] \
    At the bottom of the Cloud Console, a
    <a href='https://cloud.google.com/shell/docs/features'>Cloud Shell</a>
    session starts and displays a command-line prompt. Cloud Shell is a shell
    environment with the Cloud SDK already installed, including the
    <code>gcloud</code> command-line tool, and with values already set for your
    current project. It can take a few seconds for the session to initialize.

3.  In Cloud Shell, clone this repository:

    ```sh
    git clone https://github.com/cloudspannerecosystem/autoscaler.git
    ```

4.  Export a variable for the Autoscaler working directory:

    ```sh
    cd autoscaler && export AUTOSCALER_ROOT="$(pwd)"
    ```

5.  Export a variable to indicate your chosen deployment model:

    For the decoupled deployment model:

    ```sh
    export AUTOSCALER_DEPLOYMENT_MODEL=decoupled
    ```

    Alternatively, for the decoupled deployment model:

    ```sh
    export AUTOSCALER_DEPLOYMENT_MODEL=unified
    ```

6.  Export a variable for the root of the deployment:

    ```sh
    export AUTOSCALER_DIR="${AUTOSCALER_ROOT}/terraform/gke/${AUTOSCALER_DEPLOYMENT_MODEL}"
    ```

## Preparing the Autoscaler Project

In this section you prepare your project for deployment.

1.  Go to the [project selector page][project-selector] in the Cloud Console.
    Select or create a Cloud project.

2.  Make sure that billing is enabled for your Google Cloud project.
    [Learn how to confirm billing is enabled for your project][enable-billing].

3.  In Cloud Shell, configure the environment with the ID of your
    **autoscaler** project:

    ```sh
    export PROJECT_ID=<INSERT_YOUR_PROJECT_ID>
    gcloud config set project ${PROJECT_ID}
    ```

4.  Set the region where the Autoscaler resources will be created:

    ```sh
    export REGION=us-central1
    ```

5.  Enable the required Cloud APIs:

    ```sh
    gcloud services enable iam.googleapis.com \
      artifactregistry.googleapis.com \
      cloudbuild.googleapis.com \
      cloudresourcemanager.googleapis.com \
      container.googleapis.com \
      logging.googleapis.com \
      monitoring.googleapis.com \
      spanner.googleapis.com
    ```

6.  If you want to create a new Spanner instance for testing the Autoscaler, set
    the following variable. The Spanner instance that Terraform creates is named
    `autoscale-test`.

    ```sh
    export TF_VAR_terraform_spanner_test=true
    ```

    On the other hand, if you do not want to create a new Spanner instance
    because you already have an instance for the Autoscaler to monitor, set the
    name name of your instance in the following variable

    ```sh
    export TF_VAR_spanner_name=<INSERT_YOUR_SPANNER_INSTANCE_NAME>
    ```

    For more information on how to configure your Spanner instance to be
    managed by Terraform, see
    [Importing your Spanner instances](#importing-your-spanner-instances)

7.  There are two options for deploying the state store for the Autoscaler:

    1.  Store the state in [Firestore][cloud-firestore]
    2.  Store the state in [Spanner][spanner]

    For Firestore, follow the steps in
    [Using Firestore for Autoscaler State](#using-firestore-for-autoscaler-state).
    For Spanner, follow the steps in [Using Spanner for Autoscaler state](#using-spanner-for-autoscaler-state).

### Using Firestore for Autoscaler state

1.  To use Firestore for the Autoscaler state, choose the
    [App Engine Location][app-engine-location] where the Autoscaler
    infrastructure will be created, for example:

    ```sh
    export APP_ENGINE_LOCATION=us-central
    ```

2.  Enable the additional APIs:

    ```sh
    gcloud services enable \
      appengine.googleapis.com \
      firestore.googleapis.com
    ```

3.  Create a Google App Engine app to enable the API for Firestore:

    ```sh
    gcloud app create --region="${APP_ENGINE_LOCATION}"
    ```

4.  To store the state of the Autoscaler, update the database created with the
    Google App Engine app to use [Firestore native mode][firestore-native].

    ```sh
    gcloud firestore databases update --type=firestore-native
    ```

    You will also need to make a minor modification to the Autoscaler
    configuration. The required steps to do this are later in these
    instructions.

5.  Next, continue to [Creating Autoscaler infrastructure](#creating-autoscaler-infrastructure).

### Using Spanner for Autoscaler state

1.  If you want to store the state in Cloud Spanner and you don't have a Spanner
    instance yet for that, then set the following variable so that Terraform
    creates an instance for you named `autoscale-test-state`:

    ```sh
    export TF_VAR_terraform_spanner_state=true
    ```

    It is a best practice not to store the Autoscaler state in the same
    instance that is being monitored by the Autoscaler.

    Optionally, you can change the name of the instance that Terraform
    will create:

    ```sh
    export TF_VAR_spanner_state_name=<INSERT_STATE_SPANNER_INSTANCE_NAME>
    ```

    If you already have a Spanner instance where state must be stored,
    only set the the name of your instance:

    ```sh
    export TF_VAR_spanner_state_name=<INSERT_YOUR_STATE_SPANNER_INSTANCE_NAME>
    ```

    If you want to manage the state of the Autoscaler in your own
    Cloud Spanner instance, please create the following table in advance:

    ```sql
    CREATE TABLE spannerAutoscaler (
      id STRING(MAX),
      lastScalingTimestamp TIMESTAMP,
      createdOn TIMESTAMP,
      updatedOn TIMESTAMP,
      lastScalingCompleteTimestamp TIMESTAMP,
      scalingOperationId STRING(MAX),
      scalingRequestedSize INT64,
      scalingMethod STRING(MAX),
      scalingPreviousSize INT64,
    ) PRIMARY KEY (id)
    ```

    Note: If you are upgrading from v1.x, then you need to add the 5 new columns
    to the spanner schema using the following DDL statements

    ```sql
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS lastScalingCompleteTimestamp TIMESTAMP;
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingOperationId STRING(MAX);
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingRequestedSize INT64;
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingMethod STRING(MAX);
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingPreviousSize INT64;
    ```

    Note: If you are upgrading from V2.0.x, then you need to add the 3 new columns
    to the spanner schema using the following DDL statements

    ```sql
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingRequestedSize INT64;
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingMethod STRING(MAX);
    ALTER TABLE spannerAutoscaler ADD COLUMN IF NOT EXISTS scalingPreviousSize INT64;
    ```

2.  Next, continue to [Creating Autoscaler infrastructure](#creating-autoscaler-infrastructure).

## Creating Autoscaler infrastructure

In this section you deploy the Autoscaler infrastructure.

1.  Set the project ID and region in the corresponding Terraform
    environment variables:

    ```sh
    export TF_VAR_project_id=${PROJECT_ID}
    export TF_VAR_region=${REGION}
    ```

2.  Change directory into the Terraform per-project directory and initialize it:

    ```sh
    cd ${AUTOSCALER_DIR}
    terraform init
    ```

3.  Create the Autoscaler infrastructure:

    ```sh
    terraform plan -out=terraform.tfplan
    terraform apply -auto-approve terraform.tfplan
    ```

If you are running this command in Cloud Shell and encounter errors of the form
"`Error: cannot assign requested address`", this is a
[known issue][provider-issue] in the Terraform Google provider, please retry
with `-parallelism=1`.

## Importing your Spanner instances

If you have existing Spanner instances that you want to
[import to be managed by Terraform][terraform-import], follow the instructions
in this section.

1.  List your spanner instances

    ```sh
    gcloud spanner instances list --format="table(name)"
    ```

2.  Set the following variable with the instance name from the output of the
    above command that you want to import

    ```sh
    SPANNER_INSTANCE_NAME=<YOUR_SPANNER_INSTANCE_NAME>
    ```

3.  Create a Terraform config file with an empty
    [`google_spanner_instance`][terraform-spanner-instance] resource

    ```sh
    echo "resource \"google_spanner_instance\" \"${SPANNER_INSTANCE_NAME}\" {}" > "${SPANNER_INSTANCE_NAME}.tf"
    ```

4.  [Import][terraform-import-usage] the Spanner instance into the Terraform
    state.

    ```sh
    terraform import "google_spanner_instance.${SPANNER_INSTANCE_NAME}" "${SPANNER_INSTANCE_NAME}"
    ```

5.  After the import succeeds, update the Terraform config file for your
    instance with the actual instance attributes

    ```sh
    terraform state show -no-color "google_spanner_instance.${SPANNER_INSTANCE_NAME}" \
      | grep -vE "(id|num_nodes|state|timeouts).*(=|\{)" \
      > "${SPANNER_INSTANCE_NAME}.tf"
    ```

If you have additional Spanner instances to import, repeat this process.

Importing Spanner databases is also possible using the
[`google_spanner_database`][terraform-spanner-db] resource and following a
similar process.

## Building the Autoscaler

1.  Change to the directory that contains the Autoscaler source code:

    ```sh
    cd ${AUTOSCALER_ROOT}
    ```

2.  Build the Autoscaler components by following the instructions in the
    appropriate section:

    *   [Building the Autoscaler for a unified deployment model] (#building-the-autoscaler-for-a-unified-deployment-model)
    *   [Building the Autoscaler for a decoupled deployment model] (#building-the-autoscaler-for-a-decoupled-deployment-model)

### Building the Autoscaler for a unified deployment model

To build the Autoscaler and push the image to Artifact Registry, run the
following commands:

1.  Build the Autoscaler:

    ```sh
    gcloud builds submit . --config=cloudbuild-unified.yaml --region=${REGION}
    ```

2.  Construct the path to the image:

    ```sh
    SCALER_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/spanner-autoscaler/scaler"
    ```

3.  Retrieve the SHA256 hash of the image:

    ```sh
    SCALER_SHA=$(gcloud artifacts docker images describe ${SCALER_PATH}:latest --format='value(image_summary.digest)')
    ```

4.  Construct the full path to the image, including the SHA256 hash:

    ```sh
    SCALER_IMAGE="${SCALER_PATH}@${SCALER_SHA}"
    ```

Next, follow the instructions in the
[Deploying the Autoscaler](#deploying-the-autoscaler) section.

### Building the Autoscaler for a decoupled deployment model

To build the Autoscaler and push the images to Artifact Registry, run the
following commands:

1.  Build the Autoscaler components:

    ```sh
    gcloud builds submit . --config=cloudbuild-poller.yaml --region=${REGION} && \
    gcloud builds submit . --config=cloudbuild-scaler.yaml --region=${REGION}
    ```

2.  Construct the paths to the images:

    ```sh
    POLLER_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/spanner-autoscaler/poller"
    SCALER_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/spanner-autoscaler/scaler"
    ```

3.  Retrieve the SHA256 hashes of the images:

    ```sh
    POLLER_SHA=$(gcloud artifacts docker images describe ${POLLER_PATH}:latest --format='value(image_summary.digest)')
    SCALER_SHA=$(gcloud artifacts docker images describe ${SCALER_PATH}:latest --format='value(image_summary.digest)')
    ```

4.  Construct the full paths to the images, including the SHA256 hashes:

    ```sh
    POLLER_IMAGE="${POLLER_PATH}@${POLLER_SHA}"
    SCALER_IMAGE="${SCALER_PATH}@${SCALER_SHA}"
    ```

Next, follow the instructions in the
[Deploying the Autoscaler](#deploying-the-autoscaler) section.

## Deploying the Autoscaler

1.  Retrieve the credentials for the cluster where the Autoscaler will be deployed:

    ```sh
    gcloud container clusters get-credentials spanner-autoscaler --region=${REGION}
    ```

2.  Prepare the Autoscaler configuration files by running the following command:

    ```sh
    cd ${AUTOSCALER_ROOT}/kubernetes/${AUTOSCALER_DEPLOYMENT_MODEL} && \
    for template in $(ls autoscaler-config/*.template) ; do envsubst < ${template} > ${template%.*} ; done
    ```

3.  Deploy the `otel-collector` service so that it is ready to collect metrics:

    ```sh
    cd ${AUTOSCALER_ROOT}/kubernetes/${AUTOSCALER_DEPLOYMENT_MODEL} && \
    kubectl apply -f autoscaler-config/otel-collector.yaml && \
    kubectl apply -f autoscaler-pkg/networkpolicy.yaml && \
    kubectl apply -f autoscaler-pkg/otel-collector/otel-collector.yaml
    ```

4.  Next configure the Kubernetes manifests and deploy the Autoscaler to
    the clusterusing the following commands:

    ```sh
    cd ${AUTOSCALER_ROOT}/kubernetes/${AUTOSCALER_DEPLOYMENT_MODEL} && \
    kpt fn eval --image gcr.io/kpt-fn/apply-setters:v0.1.1 autoscaler-pkg -- \
        poller_image=${POLLER_IMAGE} scaler_image=${SCALER_IMAGE} && \
    kubectl apply -f autoscaler-pkg/ --recursive
    ```

5.  Next, to see how the Autoscaler is configured, run the following command to
    output the example configuration:

    ```sh
    cat autoscaler-config/autoscaler-config*.yaml
    ```

    These two files configure each instance of the autoscaler that you
    scheduled in the previous step. Notice the environment variable
    `AUTOSCALER_CONFIG`. You can use this variable to reference a configuration
    that will be used by that individual instance of the autoscaler. This means
    that you can configure multiple scaling schedules across multiple Spanner
    instances.

    If you do not supply this value, a default of `autoscaler-config.yaml` will
    be used.

    You can autoscale multiple Spanner instances on a single schedule by
    including multiple YAML stanzas in any of the scheduled configurations. For
    the schema of the configuration, see the [Poller configuration]
    [autoscaler-config-params] section.

    The sample configuration creates two schedules to demonstrate autoscaling;
    a [frequently running schedule][cron-frequent] to dynamically scale the
    Spanner instance according to utilization, and an [hourly schedule][cron-hourly]
    to directly scale the Spanner instance every hour. When you configure the
    Autoscaler for production, you can configure this schedule to fit your needs.

6.  If you have chosen to use Firestore to hold the Autoscaler state as described
    above, edit the above files, and remove the following lines:

    ```yaml
     stateDatabase:
       name: spanner
       instanceId: autoscale-test
       databaseId: spanner-autoscaler-state
    ```

    **Note:** If you do not remove these lines, the Autoscaler will attempt to
    use the above non-existent Spanner database for its state store, which will
    result in the Poller component failing to start. Please see the
    [Troubleshooting](#troubleshooting) section for more details.

    If you have chosen to use your own Spanner instance, please edit the above
    configuration files accordingly.

7.  To configure the Autoscaler and begin scaling operations, run the following
     command:

     ```sh
     kubectl apply -f autoscaler-config/
     ```

8.  Any changes made to the configuration files and applied with `kubectl
     apply` will update the Autoscaler configuration.

9.  You can view logs for the Autoscaler components via `kubectl` or the [Cloud
     Logging][cloud-console-logging] interface in the Google Cloud console.

## Metrics in GKE deployment

Unlike a in cloud functions deployment, In a GKE deployment, the counters
generated by the `poller` and `scaler` components are forwarded to the
[OpenTelemetry Collector (`otel-collector`)][otel-collector] service.
This service is specified by an the environmental variable `OTEL_COLLECTOR_URL`
passed to the poller and scaler workloads.

This collector is run as a [service](../../kubernetes/decoupled/autoscaler-pkg/otel-collector/otel-collector.yaml)
to receive metrics as gRPC messages on port 4317, then export them to Google
Cloud Monitoring. This configuration is defined in a [ConfigMap](../../kubernetes/decoupled/autoscaler-config/otel-collector.yaml.template).

Metrics can be sent to other exporters by modifying the Collector ConfigMap.

A [NetworkPolicy rule](../../kubernetes/decoupled/autoscaler-pkg/networkpolicy.yaml)
is also configured to allow traffic from the `poller` and `scaler` workloads
(labelled with `otel-submitter:true`) to the `otel-collector` service.

If the environment variable `OTEL_COLLECTOR_URL` is not specified, the metrics
will be sent directly to Google Cloud Monitoring.

To allow Google Cloud Monitoring to distinguish metrics from different instances
of the poller and scaler, the Kubernetes Pod name is passed to the poller and
scaler componnents via the environmental variable `K8S_POD_NAME`. If this
variable is not specified, and if the Pod name attribute is not appended to the
metrics by configuring the
[Kubernetes Attributes Processor](https://opentelemetry.io/docs/kubernetes/collector/components/#kubernetes-attributes-processor)
in the OpenTelemetry Collector, then there will be Send TimeSeries errors
reported when the Collector exports the metrics to GCM.

## Troubleshooting

This section contains guidance on what to do if you encounter issues when
following the instructions above.

### If the GKE cluster is not successfully created

1.  Check there are no [Organizational Policy][organizational-policy] rules
    that may conflict with cluster creation.

### If you do not see scaling operations as expected

1.  The first step if you are encountering scaling issues is to check the logs
    for the Autoscaler in [Cloud Logging][cloud-console-logging]. To retrieve
    the logs for the `Poller` and `Scaler` components, use the following query:

    ```terminal
    resource.type="k8s_container"
    resource.labels.namespace_name="spanner-autoscaler"
    resource.labels.container_name="poller" OR resource.labels.container_name="scaler"
    ```

    If you do not see any log entries, check that you have selected the correct
    time period to display in the Cloud Logging console, and that the GKE
    cluster nodes have the correct permissions to write logs to the Cloud
    Logging API ([roles/logging.logWriter][logging-iam-role]).

### If the Poller fails to run successfully

1.  If you have chosen to use Firestore for Autoscaler state and you see the
    following error in the logs:

    ```sh
     Error: 5 NOT_FOUND: Database not found: projects/<YOUR_PROJECT>/instances/autoscale-test/databases/spanner-autoscaler-state
    ```

    Edit the file `${AUTOSCALER_ROOT}/autoscaler-config/autoscaler-config.yaml`
    and remove the following stanza:

    ```yaml
     stateDatabase:
       name: spanner
       instanceId: autoscale-test
       databaseId: spanner-autoscaler-state
    ```

2.  Check the formatting of the YAML configration file:

    ```sh
    cat ${AUTOSCALER_ROOT}/autoscaler-config/autoscaler-config.yaml
    ```

3.  Validate the contents of the YAML configuraration file:

    ```sh
    npm ci
    npm run validateConfigFile -- ${AUTOSCALER_ROOT}/autoscaler-config/autoscaler-config.yaml
    ```

<!-- LINKS: https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[architecture-gke]: ../../resources/architecture-gke.png
[autoscaler-poller]: ../../src/poller/README.md
[autoscaler-config-params]: ../../src/poller/README.md#configuration-parameters
[cron-frequent]: ../../kubernetes/decoupled/autoscaler-pkg/poller/poller.yaml
[cron-hourly]: ../../kubernetes/decoupled/autoscaler-pkg/poller/poller-hourly.yaml
[margins]: ../../src/poller/README.md#margins
[scaling-methods]: ../../src/scaler/README.md#scaling-methods
[otel-collector]: https://opentelemetry.io/docs/collector/
[gcm-docs]: https://cloud.google.com/monitoring/docs

<!-- GKE deployment architecture -->
[gke]: https://cloud.google.com/kubernetes-engine
[kubernetes-configmap]: https://kubernetes.io/docs/concepts/configuration/configmap/
[kubernetes-cronjob]: https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
[kubernetes-job]: https://kubernetes.io/docs/concepts/workloads/controllers/job/
[logging-iam-role]: https://cloud.google.com/logging/docs/access-control#logging.logWriter
[spanner]: https://cloud.google.com/spanner/
[cloud-monitoring]: https://cloud.google.com/monitoring
[cloud-firestore]: https://cloud.google.com/firestore
[cloud-functions]: https://cloud.google.com/functions

<!-- General -->
[project-selector]: https://console.cloud.google.com/projectselector2/home/dashboard
[enable-billing]: https://cloud.google.com/billing/docs/how-to/modify-project
[cloud-console]: https://console.cloud.google.com
[cloud-console-logging]: https://console.cloud.google.com/logs/query
[cloud-shell]: https://console.cloud.google.com/?cloudshell=true
[app-engine-location]: https://cloud.google.com/appengine/docs/locations
[terraform-import]: https://www.terraform.io/docs/import/index.html
[terraform-import-usage]: https://www.terraform.io/docs/import/usage.html
[terraform-spanner-instance]: https://www.terraform.io/docs/providers/google/r/spanner_instance.html
[terraform-spanner-db]: https://www.terraform.io/docs/providers/google/r/spanner_database.html
[provider-issue]: https://github.com/hashicorp/terraform-provider-google/issues/6782
[organizational-policy]: https://cloud.google.com/resource-manager/docs/organization-policy/overview
[firestore-native]: https://cloud.google.com/datastore/docs/firestore-or-datastore#in_native_mode
