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

locals {
  config = var.json_config != "" ? var.json_config : base64encode(jsonencode([
      merge ({
        "projectId" : "${var.project_id}",
        "instanceId" : "${var.spanner_name}",
        "scalerPubSubTopic" : "${var.target_pubsub_topic}",
        "units" : "${var.units}",
        "minSize" : var.min_size,
        "maxSize" : var.max_size,
        "scalingMethod" : "${var.scaling_method}",
        "stateDatabase": var.terraform_spanner_state ? {
          "name":       "spanner",
          "instanceId": "${var.state_spanner_name}"
          "databaseId": "spanner-autoscaler-state"
        } : {
          "name":       "firestore",
        }
      },
      var.state_project_id != null ? {
        "stateProjectId" : "${var.state_project_id}"
      } : {})
    ]))
}

resource "google_app_engine_application" "app" {
  project     = var.project_id
  location_id = var.location
}

resource "google_cloud_scheduler_job" "poller_job" {
  name        = "poll-main-instance-metrics"
  description = "Poll metrics for main-instance"
  schedule    = var.schedule
  time_zone   = var.time_zone

  pubsub_target {
    topic_name = var.pubsub_topic
    data       = local.config
  }

  depends_on = [google_app_engine_application.app]
}
