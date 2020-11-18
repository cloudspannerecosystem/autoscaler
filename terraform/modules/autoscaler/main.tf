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

resource "google_project_iam_binding" "scaler_sa_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"

  members = [
    "serviceAccount:${google_service_account.scaler_sa.email}",
  ]
}

// PubSub

resource "google_pubsub_topic" "poller_topic" {
  name = "poller-topic"
}

resource "google_pubsub_topic_iam_binding" "poller_pubsub_sub_binding" {
  project = var.project_id
  topic = google_pubsub_topic.poller_topic.name
  role = "roles/pubsub.subscriber"
  members = [
    "serviceAccount:${google_service_account.poller_sa.email}",
  ]
}

resource "google_pubsub_topic_iam_binding" "forwarder_pubsub_pub_binding" {
  project = var.project_id
  topic = google_pubsub_topic.poller_topic.name
  role = "roles/pubsub.publisher"
  members = var.forwarder_sa_emails
}

resource "google_pubsub_topic" "scaler_topic" {
  name = "scaler-topic"
}

resource "google_pubsub_topic_iam_binding" "poller_pubsub_pub_binding" {
  project = var.project_id
  topic = google_pubsub_topic.scaler_topic.name
  role = "roles/pubsub.publisher"
  members = [
    "serviceAccount:${google_service_account.poller_sa.email}",
  ]
}

resource "google_pubsub_topic_iam_binding" "scaler_pubsub_sub_binding" {
  project = var.project_id
  topic = google_pubsub_topic.scaler_topic.name
  role = "roles/pubsub.subscriber"
  members = [
    "serviceAccount:${google_service_account.scaler_sa.email}",
  ]
}

// Cloud Functions

resource "google_storage_bucket" "bucket_gcf_source" {
  name          = "${var.project_id}-gcf-source"
  storage_class = "REGIONAL"
  location      = var.region
  force_destroy = "true"
}

data "archive_file" "local_poller_source" {
  type        = "zip"
  source_dir  = "${abspath("${path.module}/../../../poller")}"
  output_path = "${var.local_output_path}/poller.zip"
}

resource "google_storage_bucket_object" "gcs_functions_poller_source" {
  name   = "poller.${data.archive_file.local_poller_source.output_md5}.zip"
  bucket = google_storage_bucket.bucket_gcf_source.name
  source = data.archive_file.local_poller_source.output_path
}

data "archive_file" "local_scaler_source" {
  type        = "zip"
  source_dir  = "${abspath("${path.module}/../../../scaler")}"
  output_path = "${var.local_output_path}/scaler.zip"
}

resource "google_storage_bucket_object" "gcs_functions_scaler_source" {
  name   = "scaler.${data.archive_file.local_scaler_source.output_md5}.zip"
  bucket = google_storage_bucket.bucket_gcf_source.name
  source = data.archive_file.local_scaler_source.output_path
}

resource "google_cloudfunctions_function" "poller_function" {
  name = "tf-poller-function"
  project = var.project_id
  region = var.region
  available_memory_mb = "256"
  entry_point = "checkSpannerScaleMetricsPubSub"
  runtime = "nodejs10"
  event_trigger {
    event_type = "google.pubsub.topic.publish"
    resource   = google_pubsub_topic.poller_topic.id
  }
  source_archive_bucket = google_storage_bucket.bucket_gcf_source.name
  source_archive_object = google_storage_bucket_object.gcs_functions_poller_source.name
  service_account_email = google_service_account.poller_sa.email
}

resource "google_cloudfunctions_function" "scaler_function" {
  name = "tf-scaler-function"
  project = var.project_id
  region = var.region
  available_memory_mb = "256"
  entry_point = "scaleSpannerInstancePubSub"
  runtime = "nodejs10"
  event_trigger {
    event_type = "google.pubsub.topic.publish"
    resource   = google_pubsub_topic.scaler_topic.id
  }
  source_archive_bucket = google_storage_bucket.bucket_gcf_source.name
  source_archive_object = google_storage_bucket_object.gcs_functions_scaler_source.name
  service_account_email = google_service_account.scaler_sa.email
}