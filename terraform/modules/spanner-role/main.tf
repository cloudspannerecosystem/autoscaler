resource "google_project_iam_custom_role" "spanner_instance_manager" {
  role_id     = "spannerAutoscalerInstanceManager"
  title       = "Spanner Autoscaler Instance Manager"
  description = "Allows a principal to modify spanner instances"
  permissions = ["spanner.instanceOperations.get", "spanner.instances.update"]
}
