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
  type = string
}

variable "spanner_name" {
  type    = string
  default = "autoscale-test"
}

variable "terraform_spanner_test" {
  description = "If set to true, Terraform will create a Cloud Spanner instance and DB for testing."
  type        = bool
  default     = false
}

variable "terraform_spanner_state" {
  description = "If set to true, Terraform will create a DB to hold the Autoscaler state."
  type        = bool
  default     = false
}

variable "spanner_test_processing_units" {
  description = "Default processing units for test Spanner, if created"
  default     = 100
}

variable "spanner_state_processing_units" {
  description = "Default processing units for state Spanner, if created"
  default     = 100
}

variable "spanner_state_name" {
  type    = string
  default = "autoscale-test-state"
}

variable "app_project_id" {
  description = "The project where the Spanner instance(s) live. If specified and different than project_id => centralized deployment"
  type        = string
  default     = ""
}

variable "terraform_dashboard" {
  description = "If set to true, Terraform will create a Cloud Monitoring dashboard including important Spanner metrics."
  type        = bool
  default     = true
}
