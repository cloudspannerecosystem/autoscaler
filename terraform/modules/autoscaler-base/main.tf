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


// Service Accounts

resource "google_service_account" "poller_sa" {
  account_id   = "poller-sa"
  display_name = "Autoscaler - Metrics Poller Service Account"
}

resource "google_service_account" "scaler_sa" {
  account_id   = "scaler-sa"
  display_name = "Autoscaler - Scaler Function Service Account"
}

resource "google_project_iam_member" "poller_sa_spanner" {
  project = var.project_id
  role    = "roles/spanner.viewer"

  member = "serviceAccount:${google_service_account.poller_sa.email}"
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
  member  = "serviceAccount:${google_service_account.scaler_sa.email}"
}

resource "google_pubsub_schema" "scaler_downstream_pubsub_schema" {
  name = "downstream-schema"
  type = "PROTOCOL_BUFFER"
  definition = "${file("${path.module}/../../../scaler/scaler-core/downstream.schema.proto")}"
}
