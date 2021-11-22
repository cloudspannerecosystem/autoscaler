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

resource "google_spanner_instance" "main" {
  count        = var.terraform_spanner ? 1 : 0

  name         = var.spanner_name
  config       = "regional-${var.region}"
  display_name = var.spanner_name
  project      = var.project_id
  num_nodes    = 1
}

resource "google_spanner_database" "database" {
  count        = var.terraform_spanner ? 1 : 0

  instance = var.spanner_name
  name     = "my-database"
  ddl = [
    "CREATE TABLE t1 (t1 INT64 NOT NULL,) PRIMARY KEY(t1)",
    "CREATE TABLE t2 (t2 INT64 NOT NULL,) PRIMARY KEY(t2)",
  ]
  # Must specify project because provider project may be different than var.project_id
  project      = var.project_id

  depends_on = [google_spanner_instance.main]
}

resource "google_spanner_instance_iam_member" "spanner_metadata_get_iam" {
  instance = var.spanner_name
  role     = "roles/spanner.viewer"
  project  = var.project_id
  member   = "serviceAccount:${var.poller_sa_email}"

  depends_on = [google_spanner_instance.main]
}

resource "google_spanner_instance_iam_member" "spanner_admin_iam" {
  # Allows scaler to change the number of nodes of the Spanner instance
  instance = var.spanner_name
  role     = "roles/spanner.admin"
  project  = var.project_id
  member   = "serviceAccount:${var.scaler_sa_email}"

  depends_on = [google_spanner_instance.main]
}

resource "google_project_iam_member" "poller_sa_cloud_monitoring" {
  # Allows poller to get Spanner metrics
  role    = "roles/monitoring.viewer"
  project = var.project_id
  member  = "serviceAccount:${var.poller_sa_email}"
}
