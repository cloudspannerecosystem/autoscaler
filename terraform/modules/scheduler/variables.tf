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
  default = "us-central"
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

variable "pubsub_data" {
  type = string
}
