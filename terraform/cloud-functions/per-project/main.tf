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
      version = "~> 5.38.0"
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
  source = "../../modules/autoscaler-base"

  project_id      = var.project_id
  poller_sa_email = google_service_account.poller_sa.email
  scaler_sa_email = google_service_account.scaler_sa.email
}

module "autoscaler-functions" {
  source = "../../modules/autoscaler-functions"

  project_id      = var.project_id
  region          = var.region
  poller_sa_email = google_service_account.poller_sa.email
  scaler_sa_email = google_service_account.scaler_sa.email
}

module "firestore" {
  source = "../../modules/firestore"

  project_id      = local.app_project_id
  poller_sa_email = google_service_account.poller_sa.email
  scaler_sa_email = google_service_account.scaler_sa.email
}

module "spanner" {
  source = "../../modules/spanner"

  terraform_spanner_state        = var.terraform_spanner_state
  terraform_spanner_test         = var.terraform_spanner_test
  project_id                     = local.app_project_id
  region                         = var.region
  spanner_name                   = var.spanner_name
  spanner_state_name             = var.spanner_state_name
  spanner_test_processing_units  = var.spanner_test_processing_units
  spanner_state_processing_units = var.spanner_state_processing_units
  poller_sa_email                = google_service_account.poller_sa.email
  scaler_sa_email                = google_service_account.scaler_sa.email
}

module "scheduler" {
  source = "../../modules/scheduler"

  project_id              = var.project_id
  location                = var.region
  spanner_name            = var.spanner_name
  pubsub_topic            = module.autoscaler-functions.poller_topic
  target_pubsub_topic     = module.autoscaler-functions.scaler_topic
  terraform_spanner_state = var.terraform_spanner_state
  spanner_state_name      = var.spanner_state_name

  // Example of passing config as json
  // json_config             = base64encode(jsonencode([{
  //   "projectId": "${var.project_id}",
  //   "instanceId": "${module.spanner.spanner_name}",
  //   "scalerPubSubTopic": "${module.autoscaler.scaler_topic}",
  //   "units": "NODES",
  //   "minSize": 1
  //   "maxSize": 3,
  //   "scalingMethod": "LINEAR"
  // }]))
}

module "monitoring" {
  count  = var.terraform_dashboard ? 1 : 0
  source = "../../modules/monitoring"

  project_id = local.app_project_id
}
