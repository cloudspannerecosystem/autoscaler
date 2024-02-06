/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

resource "google_project_iam_member" "poller_sa_spanner" {
  project = var.project_id
  role    = "roles/spanner.viewer"

  member = "serviceAccount:${var.poller_sa_email}"
}

// Downstream topic

resource "google_pubsub_topic" "downstream_topic" {
  name = "downstream-topic"

  depends_on = [google_pubsub_schema.scaler_downstream_pubsub_schema]

  schema_settings {
    schema =  google_pubsub_schema.scaler_downstream_pubsub_schema.id
    encoding = "JSON"
  }

  lifecycle {
    replace_triggered_by = [google_pubsub_schema.scaler_downstream_pubsub_schema]
  }
}

resource "google_pubsub_topic_iam_member" "scaler_downstream_pub_iam" {
  project = var.project_id
  topic   = google_pubsub_topic.downstream_topic.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.scaler_sa_email}"
}

resource "google_pubsub_schema" "scaler_downstream_pubsub_schema" {
  name = "downstream-schema"
  type = "PROTOCOL_BUFFER"
  definition = "${file("${path.module}/../../../src/scaler/scaler-core/downstream.schema.proto")}"
}

resource "google_project_iam_member" "metrics_publisher_iam_poller" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${var.poller_sa_email}"
}

resource "google_project_iam_member" "metrics_publisher_iam_scaler" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${var.scaler_sa_email}"
}

locals {
  spanner_labels = [
    {
        key = "spanner_project_id"
        description = "The project ID of the spanner instance being scaled"
    }, {
        key = "spanner_instance_id"
        description = "The instance ID of the spanner instance being scaled"
    }
  ]
  scaler_labels = concat(local.spanner_labels, [
    {
        key = "scaling_method"
        description = "The scaling method used to calculate the new size"
    }, {
        key = "scaling_direction"
        description = "The direction of the scaling event"
    }])
  scaler_denied_labels = concat(local.scaler_labels, [
    {
        key = "scaling_denied_reason"
        description = "The reason why the scaling request was rejected"
    }])
}

resource "google_monitoring_metric_descriptor" "metric_scaler_scaling_success" {
  project = var.project_id
  description = "The number of Spanner scaling events that succeeded"
  display_name = "cloudspannerecosystem/autoscaler/scaler/scaling-success"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/scaler/scaling-success"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
  dynamic "labels" {
    for_each = local.scaler_labels
    content {
      key = labels.value["key"]
      value_type = "STRING"
      description = labels.value["description"]
    }
  }
}

resource "google_monitoring_metric_descriptor" "metric_scaler_scaling_denied" {
  project = var.project_id
  description = "The number of Spanner scaling events denied"
  display_name = "cloudspannerecosystem/autoscaler/scaler/scaling-denied"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/scaler/scaling-denied"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
  dynamic "labels" {
    for_each = local.scaler_denied_labels
    content {
      key = labels.value["key"]
      value_type = "STRING"
      description = labels.value["description"]
    }
  }
}

resource "google_monitoring_metric_descriptor" "metric_scaler_scaling_failed" {
  project = var.project_id
  description = "The number of Spanner scaling events that failed"
  display_name = "cloudspannerecosystem/autoscaler/scaler/scaling-failed"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/scaler/scaling-failed"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
  dynamic "labels" {
    for_each = local.scaler_labels
    content {
      key = labels.value["key"]
      value_type = "STRING"
      description = labels.value["description"]
    }
  }
}

resource "google_monitoring_metric_descriptor" "metric_scaler_requests_success" {
  project = var.project_id
  description = "The number of scaling request messages handled successfully"
  display_name = "cloudspannerecosystem/autoscaler/scaler/requests-success"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/scaler/requests-success"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
}

resource "google_monitoring_metric_descriptor" "metric_scaler_requests_failed" {
  project = var.project_id
  description = "The number of scaling request messages handled failedfully"
  display_name = "cloudspannerecosystem/autoscaler/scaler/requests-failed"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/scaler/requests-failed"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
}


resource "google_monitoring_metric_descriptor" "metric_poller_polling_success" {
  project = var.project_id
  description = "The number of Spanner polling events that succeeded"
  display_name = "cloudspannerecosystem/autoscaler/poller/polling-success"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/poller/polling-success"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
  dynamic "labels" {
    for_each = local.spanner_labels
    content {
      key = labels.value["key"]
      value_type = "STRING"
      description = labels.value["description"]
    }
  }
}

resource "google_monitoring_metric_descriptor" "metric_poller_polling_failed" {
  project = var.project_id
  description = "The number of Spanner polling events that failed"
  display_name = "cloudspannerecosystem/autoscaler/poller/polling-failed"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/poller/polling-failed"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
  dynamic "labels" {
    for_each = local.spanner_labels
    content {
      key = labels.value["key"]
      value_type = "STRING"
      description = labels.value["description"]
    }
  }
}

resource "google_monitoring_metric_descriptor" "metric_poller_requests_success" {
  project = var.project_id
  description = "The number of polling request messages handled successfully"
  display_name = "cloudspannerecosystem/autoscaler/poller/requests-success"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/poller/requests-success"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
}

resource "google_monitoring_metric_descriptor" "metric_poller_requests_failed" {
  project = var.project_id
  description = "The number of polling request messages that failed"
  display_name = "cloudspannerecosystem/autoscaler/poller/requests-failed"
  type = "workload.googleapis.com/cloudspannerecosystem/autoscaler/poller/requests-failed"
  metric_kind = "CUMULATIVE"
  value_type = "DOUBLE"
  unit = "1"
}
