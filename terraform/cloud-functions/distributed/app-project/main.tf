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

data "terraform_remote_state" "autoscaler" {
  backend = "local"

  config = {
    path = "../autoscaler-project/terraform.tfstate"
  }
}

module "spanner" {
  source = "../../../modules/spanner"

  terraform_spanner_state        = var.terraform_spanner_state
  terraform_spanner_test         = var.terraform_spanner_test
  project_id                     = var.project_id
  region                         = var.region
  spanner_name                   = var.spanner_name
  spanner_state_name             = var.spanner_state_name
  spanner_test_processing_units  = var.spanner_test_processing_units
  spanner_state_processing_units = var.spanner_state_processing_units
  poller_sa_email                = data.terraform_remote_state.autoscaler.outputs.poller_sa_email
  scaler_sa_email                = data.terraform_remote_state.autoscaler.outputs.scaler_sa_email
}

module "forwarder" {
  source = "../../../modules/forwarder"

  project_id          = var.project_id
  region              = var.region
  target_pubsub_topic = data.terraform_remote_state.autoscaler.outputs.poller_topic
}

module "scheduler" {
  source = "../../../modules/scheduler"

  project_id              = var.project_id
  location                = var.region
  spanner_name            = var.spanner_name
  pubsub_topic            = module.forwarder.forwarder_topic
  target_pubsub_topic     = data.terraform_remote_state.autoscaler.outputs.scaler_topic
  terraform_spanner_state = var.terraform_spanner_state
  state_project_id        = var.state_project_id
  spanner_state_name      = var.spanner_state_name
}

module "monitoring" {
  count  = var.terraform_dashboard ? 1 : 0
  source = "../../../modules/monitoring"

  project_id = var.project_id
}
