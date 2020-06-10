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

variable "project_id" {
  type = string
}

variable "creds_file" {
  type = string
  default = "key.json"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  type    = string
  default = "us-central1-c"
}

variable "spanner_name" {
  type    = string
  default = "autoscale-test"
}

variable "terraform_spanner" {
  description = "If set to true, Terraform will create a Cloud Spanner instance and DB."
  type    = bool
  default = false
}

variable "app_project_id" {
  description = "The project where the Spanner instance(s) live. If specified and different than project_id => centralized deployment"
  type = string
  default = ""
}

locals {
  # By default, these config files produce a per-project deployment
  # If you want a centralized deployment instead, then specify 
  # an app_project_id that is different from project_id
  app_project_id = "${var.app_project_id == "" ? var.project_id : var.app_project_id}"
}