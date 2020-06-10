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

provider "google" {
    version = ">3.5.0"

    credentials = file("${var.creds_file}")

    project = var.project_id
    region  = var.region
    zone    = var.zone
}

data "terraform_remote_state" "autoscaler" {
  backend = "local"

  config = {
    path = "../autoscaler-project/terraform.tfstate"
  }
}

module "spanner" {
  source  = "../../modules/spanner"

  terraform_spanner = var.terraform_spanner
  project_id        = var.project_id
  spanner_name      = var.spanner_name
  poller_sa_email   = data.terraform_remote_state.autoscaler.outputs.poller_sa_email
  scaler_sa_email   = data.terraform_remote_state.autoscaler.outputs.scaler_sa_email
}

module "forwarder" {
  source = "../../modules/forwarder"

  project_id          = var.project_id
  region              = var.region
  target_pubsub_topic = data.terraform_remote_state.autoscaler.outputs.poller_topic
}

module "scheduler" {
  source  = "../../modules/scheduler"

  project_id   = var.project_id
  pubsub_topic = module.forwarder.forwarder_topic
  pubsub_data  = base64encode(jsonencode([{"projectId": "${var.project_id}", "instanceId": "${module.spanner.spanner_name}", "scalerPubSubTopic": "${data.terraform_remote_state.autoscaler.outputs.scaler_topic}", "minNodes": 1, "maxNodes": 3, "stateProjectId": "${var.state_project_id}"}]))
}