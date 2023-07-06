/**
 * Copyright 2022 Google LLC
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

/*
 * The Firestore database is created using this terraform module and the
 * terraform-created service account used by the Scaler needs read/write
 * permissions to the instance in the appropriate project if Spanner
 * is not being used to hold state.
 */

resource "google_project_iam_member" "scaler_sa_firestore" {

  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${var.scaler_sa_email}"
}

resource "google_project_service" "firestore" {
  project = var.project_id
  service = "firestore.googleapis.com"
}

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.location
  type        = "FIRESTORE_NATIVE"
  depends_on = [google_project_service.firestore]
}
