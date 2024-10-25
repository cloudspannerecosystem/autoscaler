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

terraform {
  provider_meta "google" {
    module_name = "cloud-solutions/spanner-autoscaler-deploy-cf-v1.0.0" // x-release-please-version
  }
}

// PubSub

resource "google_pubsub_topic" "poller_topic" {
  project = var.project_id
  name    = "poller-topic"
}

resource "google_pubsub_topic_iam_member" "poller_pubsub_sub_iam" {
  project = var.project_id
  topic   = google_pubsub_topic.poller_topic.name
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${var.poller_sa_email}"
}

resource "google_pubsub_topic_iam_member" "forwarder_pubsub_pub_iam" {
  for_each = toset(var.forwarder_sa_emails)

  project = var.project_id
  topic   = google_pubsub_topic.poller_topic.name
  role    = "roles/pubsub.publisher"
  member  = each.key
}

resource "google_pubsub_topic" "scaler_topic" {
  project = var.project_id
  name    = "scaler-topic"
}

resource "google_pubsub_topic_iam_member" "poller_pubsub_pub_iam" {
  project = var.project_id
  topic   = google_pubsub_topic.scaler_topic.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.poller_sa_email}"
}

resource "google_pubsub_topic_iam_member" "scaler_pubsub_sub_iam" {
  project = var.project_id
  topic   = google_pubsub_topic.scaler_topic.name
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${var.scaler_sa_email}"
}

// Cloud Functions

resource "google_storage_bucket" "bucket_gcf_source" {
  project                     = var.project_id
  name                        = "${var.project_id}-gcf-source"
  storage_class               = "REGIONAL"
  location                    = var.region
  force_destroy               = "true"
  uniform_bucket_level_access = var.uniform_bucket_level_access
}

data "archive_file" "local_source" {
  type        = "zip"
  source_dir  = abspath("${path.module}/../../..")
  output_path = "${var.local_output_path}/src.zip"
  excludes = [
    ".git",
    ".github",
    ".nyc_output",
    ".vscode",
    "kubernetes",
    "node_modules",
    "resources",
    "scaler",
    "terraform"
  ]
}

resource "google_storage_bucket_object" "gcs_functions_source" {
  name   = "src.${data.archive_file.local_source.output_md5}.zip"
  bucket = google_storage_bucket.bucket_gcf_source.name
  source = data.archive_file.local_source.output_path
}

resource "google_cloudfunctions_function" "poller_function" {
  name                = "tf-poller-function"
  project             = var.project_id
  region              = var.region
  ingress_settings    = "ALLOW_INTERNAL_AND_GCLB"
  available_memory_mb = "256"
  entry_point         = "checkSpannerScaleMetricsPubSub"
  runtime             = "nodejs${var.nodejs_version}"
  event_trigger {
    event_type = "google.pubsub.topic.publish"
    resource   = google_pubsub_topic.poller_topic.id
  }
  source_archive_bucket = google_storage_bucket.bucket_gcf_source.name
  source_archive_object = google_storage_bucket_object.gcs_functions_source.name
  service_account_email = var.poller_sa_email
  build_service_account = var.build_sa_id

  lifecycle {
    ignore_changes = [max_instances]
  }
}

resource "google_cloudfunctions_function" "scaler_function" {
  name                = "tf-scaler-function"
  project             = var.project_id
  region              = var.region
  ingress_settings    = "ALLOW_INTERNAL_AND_GCLB"
  available_memory_mb = "256"
  entry_point         = "scaleSpannerInstancePubSub"
  runtime             = "nodejs${var.nodejs_version}"
  event_trigger {
    event_type = "google.pubsub.topic.publish"
    resource   = google_pubsub_topic.scaler_topic.id
  }
  source_archive_bucket = google_storage_bucket.bucket_gcf_source.name
  source_archive_object = google_storage_bucket_object.gcs_functions_source.name
  service_account_email = var.scaler_sa_email
  build_service_account = var.build_sa_id

  lifecycle {
    ignore_changes = [max_instances]
  }
}
