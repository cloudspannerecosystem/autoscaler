output "spanner_capacity_manager_iam_role_name" {
  value       = google_project_iam_custom_role.spanner_capacity_manager_iam_role.name
  description = "Name of the Spanner Capacity Manager IAM Role"
}

output "scaler_state_manager_iam_role_name" {
  value       = google_project_iam_custom_role.scaler_state_manager_iam_role.name
  description = "Name of the Scaler State Manager IAM Role"
}
