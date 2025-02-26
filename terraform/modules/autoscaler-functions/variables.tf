/*
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

variable "region" {
  type = string
}

variable "nodejs_version" {
  type    = string
  default = "20"
}

variable "local_output_path" {
  type    = string
  default = "build"
}

variable "uniform_bucket_level_access" {
  type    = bool
  default = true
}

variable "poller_sa_email" {
  type = string
}

variable "scaler_sa_email" {
  type = string
}

variable "build_sa_id" {
  type = string
  // projects/{{project}}/serviceAccounts/{{email}}
}

variable "forwarder_sa_emails" {
  type = list(string)
  // Example ["serviceAccount:forwarder_sa@app-project.iam.gserviceaccount.com"]
  default = []
}

variable "scaler_max_instance_count" {
  description = "Maximum number of instances for the scaler function"
  type        = number
  default     = null
}

variable "poller_max_instance_count" {
  description = "Maximum number of instances for the poller function"
  type        = number
  default     = null
}

variable "poller_function_available_cpu" {
  type        = number
  default     = null
  description = "The amount of available CPU for the poller function. Unset/null will allow Cloud Run to default based on Memory."
  validation {
    condition     = var.poller_function_available_cpu == null ? true : var.poller_function_available_cpu >= 0.08
    error_message = "The minimum value for poller_function_available_cpu is 0.08."
  }
}

variable "scaler_function_available_cpu" {
  type        = number
  default     = null
  description = "The amount of available CPU for the scaler function. Unset/null will allow Cloud Run to default based on Memory."
  validation {
    condition     = var.scaler_function_available_cpu == null ? true : var.scaler_function_available_cpu >= 0.08
    error_message = "The minimum value for scaler_function_available_cpu is 0.08."
  }
}
