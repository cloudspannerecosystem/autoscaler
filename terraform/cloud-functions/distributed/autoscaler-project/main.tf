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
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "6.24.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_service_account" "poller_sa" {
  account_id   = "poller-sa"
  display_name = "Autoscaler - Metrics Poller Service Account"
}

resource "google_service_account" "scaler_sa" {
  account_id   = "scaler-sa"
  display_name = "Autoscaler - Scaler Function Service Account"
}

module "autoscaler-base" {
  source = "../../../modules/autoscaler-base"

  project_id      = var.project_id
  poller_sa_email = google_service_account.poller_sa.email
  scaler_sa_email = google_service_account.scaler_sa.email
}

module "autoscaler-functions" {
  source = "../../../modules/autoscaler-functions"

  project_id          = var.project_id
  region              = var.region
  poller_sa_email     = google_service_account.poller_sa.email
  scaler_sa_email     = google_service_account.scaler_sa.email
  forwarder_sa_emails = var.forwarder_sa_emails
  build_sa_id         = module.autoscaler-base.build_sa_id
}

module "firestore" {
  source = "../../../modules/firestore"

  project_id      = var.project_id
  poller_sa_email = google_service_account.poller_sa.email
  scaler_sa_email = google_service_account.scaler_sa.email
}

output "poller_sa_email" {
  value = google_service_account.poller_sa.email
}

output "scaler_sa_email" {
  value = google_service_account.scaler_sa.email
}

output "poller_topic" {
  value = module.autoscaler-functions.poller_topic
}

output "scaler_topic" {
  value = module.autoscaler-functions.scaler_topic
}

module "monitoring" {
  count  = var.terraform_dashboard ? 1 : 0
  source = "../../../modules/monitoring"

  project_id = var.project_id
}
