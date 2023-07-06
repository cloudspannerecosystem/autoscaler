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

variable "project_id" {
  type = string
}

variable "region" {
  description = "The region where the infrastructure will be deployed."
  type    = string
  default = "us-central1"
}

variable "location" {
  description = "The location within the region where the infrastructure will be deployed."
  type = string
  default = "nam5"
}

variable "poller_sa_email" {
  type = string
}

variable "scaler_sa_email" {
  type = string
}

variable "terraform_firestore_create" {
  type = bool
  default = false
}