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
      version = "~> 4.63.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.63.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

module "autoscaler-base" {
  source = "../modules/autoscaler-base"

  project_id = var.project_id
}

module "autoscaler-cluster" {
  source = "../modules/autoscaler-cluster"

  region            = var.region
  project_id        = var.project_id
  name              = "spanner-autoscaler"
  ip_range_master   = "10.1.0.0/28"
  ip_range_pods     = ""
  ip_range_services = ""
  poller_sa_email   = module.autoscaler-base.poller_sa_email
  scaler_sa_email   = module.autoscaler-base.scaler_sa_email
}

module "firestore" {
  source = "../modules/firestore"

  project_id      = var.project_id
  poller_sa_email = module.autoscaler-base.poller_sa_email
  scaler_sa_email = module.autoscaler-base.scaler_sa_email
}

module "spanner" {
  source = "../modules/spanner"

  terraform_spanner_state        = var.terraform_spanner_state
  terraform_spanner_test         = var.terraform_spanner_test
  project_id                     = var.project_id
  spanner_name                   = var.spanner_name
  state_spanner_name             = var.state_spanner_name
  spanner_test_processing_units  = var.spanner_test_processing_units
  spanner_state_processing_units = var.spanner_state_processing_units
  poller_sa_email                = module.autoscaler-base.poller_sa_email
  scaler_sa_email                = module.autoscaler-base.scaler_sa_email
}

module "monitoring" {
  count  = var.terraform_dashboard ? 1 : 0
  source = "../modules/monitoring"

  project_id = var.project_id
}
