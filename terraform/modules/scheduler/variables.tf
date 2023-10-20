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

variable "location" {
  type    = string
  default = "nam5"
}

variable "schedule" {
  type    = string
  default = "*/2 * * * *"
}

variable "time_zone" {
  type    = string
  default = "America/Los_Angeles"
}

variable "pubsub_topic" {
  type = string
}

variable "spanner_name" {
  type = string
}

variable "target_pubsub_topic" {
  type = string
}

variable "units" {
  type        = string
  default     = "PROCESSING_UNITS"
  description = "The measure that spanner size units are being specified in either: PROCESSING_UNITS or NODES"
}

variable "min_size" {
  type        = number
  default     = 100
  description = "Minimum size that the spanner instance can be scaled in to."
}

variable "max_size" {
  type        = number
  default     = 2000
  description = "Maximum size that the spanner instance can be scaled out to."
}

variable "scaling_method" {
  type        = string
  default     = "LINEAR"
  description = "Algorithm that should be used to manage the scaling of the spanner instance: STEPWISE, LINEAR, DIRECT"
}

variable "terraform_spanner_state" {
  description = "If set to true, Terraform will create a Cloud Spanner DB to hold the Autoscaler state."
  type        = bool
  default     = false
}

variable "state_project_id" {
  type     = string
  nullable = true
  default  = null
}

variable "spanner_state_name" {
  type     = string
  nullable = true
  default  = null
}

variable "json_config" {
  type        = string
  default     = ""
  description = "Base 64 encoded json that is the autoscaler configuration for the Cloud Scheduler payload. Using this allows for setting autoscaler configuration for multiple spanners and parameters that are not directly exposed through variables."
}
