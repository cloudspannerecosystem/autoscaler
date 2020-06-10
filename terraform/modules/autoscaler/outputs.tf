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

output "poller_topic" {
  value       = google_pubsub_topic.poller_topic.id
  description = "PubSub topic used by the poller function"
}

output "poller_sa_email" {
  value       = google_service_account.poller_sa.email
  description = "Email of the poller service account"
}

output "scaler_topic" {
  value       = google_pubsub_topic.scaler_topic.id
  description = "PubSub topic used by the scaler function"
}

output "scaler_sa_email" {
  value       = google_service_account.scaler_sa.email
  description = "Email of the scaler service account"
}