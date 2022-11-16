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

resource "google_service_account" "forwarder_sa" {
  account_id   = "forwarder-sa"
  display_name = "Autoscaler - PubSub Forwarder Service Account"
}

// PubSub

resource "google_pubsub_topic" "forwarder_topic" {
  name = "forwarder-topic"
}

resource "google_pubsub_topic_iam_member" "forwader_pubsub_sub_binding" {
  project = var.project_id
  topic   = google_pubsub_topic.forwarder_topic.name
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.forwarder_sa.email}"
}

// Cloud Functions

resource "google_storage_bucket" "bucket_gcf_source" {
  name                        = "${var.project_id}-gcf-source"
  storage_class               = "REGIONAL"
  location                    = var.region
  force_destroy               = "true"
  uniform_bucket_level_access = var.uniform_bucket_level_access
}

data "archive_file" "local_forwarder_source" {
  type        = "zip"
  source_dir  = abspath("${path.module}/../../../forwarder")
  output_path = "${var.local_output_path}/forwarder.zip"
}

resource "google_storage_bucket_object" "gcs_functions_forwarder_source" {
  name   = "forwarder.${data.archive_file.local_forwarder_source.output_md5}.zip"
  bucket = google_storage_bucket.bucket_gcf_source.name
  source = data.archive_file.local_forwarder_source.output_path
}

resource "google_cloudfunctions_function" "forwarder_function" {
  name                = "tf-forwarder-function"
  project             = var.project_id
  region              = var.region
  ingress_settings    = "ALLOW_INTERNAL_AND_GCLB"
  available_memory_mb = "256"
  entry_point         = "forwardFromPubSub"
  runtime             = "nodejs10"
  event_trigger {
    event_type = "google.pubsub.topic.publish"
    resource   = google_pubsub_topic.forwarder_topic.id
  }
  environment_variables = {
    POLLER_TOPIC = var.target_pubsub_topic
  }
  source_archive_bucket = google_storage_bucket.bucket_gcf_source.name
  source_archive_object = google_storage_bucket_object.gcs_functions_forwarder_source.name
  service_account_email = google_service_account.forwarder_sa.email
}
