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

variable "region" {
  type = string
}

variable "forwarder_sa_emails" {
  type = list(string)
  // Example ["serviceAccount:forwarder_sa@app-project.iam.gserviceaccount.com"]
  default = []
}

variable "terraform_dashboard" {
  description = "If set to true, Terraform will create a Cloud Monitoring dashboard including important Spanner metrics."
  type        = bool
  default     = true
}
