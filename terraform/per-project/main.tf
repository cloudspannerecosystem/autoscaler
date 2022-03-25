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
      version = ">3.5.0"
    }
  }
}

provider "google" {
    credentials = file("${var.creds_file}")

    project = var.project_id
    region  = var.region
    zone    = var.zone
}

module "autoscaler" {
  source = "../modules/autoscaler"

  project_id = var.project_id
}

module "spanner" {
  source  = "../modules/spanner"

  terraform_spanner = var.terraform_spanner
  project_id        = local.app_project_id
  spanner_name      = var.spanner_name
  poller_sa_email   = module.autoscaler.poller_sa_email
  scaler_sa_email   = module.autoscaler.scaler_sa_email
}

module "scheduler" {
  source  = "../modules/scheduler"

  project_id   = var.project_id
  pubsub_topic = module.autoscaler.poller_topic
  pubsub_data  = base64encode(jsonencode([{
    "projectId": "${var.project_id}",
    "instanceId": "${module.spanner.spanner_name}",
    "scalerPubSubTopic": "${module.autoscaler.scaler_topic}",
    "units": "NODES",
    "minSize": 1
    "maxSize": 3,
    "scalingMethod": "LINEAR"
  }]))
}

module "monitoring" {
  count   = var.terraform_dashboard ? 1 : 0
  source  = "../modules/monitoring"

  project_id                                       = var.project_id
}