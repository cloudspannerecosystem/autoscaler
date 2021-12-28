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

resource "google_monitoring_dashboard" "dashboard" {
  project        = var.project_id
  dashboard_json = data.template_file.spanner_dashboard.rendered
}

data "template_file" "spanner_dashboard" {
  template = file("${path.module}/dashboard.tpl.json")
  vars = {
      // refer to https://cloud.google.com/spanner/docs/monitoring-cloud#high-priority-cpu
      thresholds_high_priority_cpu = var.config == "REGIONAL" ? 0.65 : 0.45,
  }
}
