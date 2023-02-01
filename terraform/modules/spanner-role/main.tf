resource "google_project_iam_custom_role" "spanner_capacity_manager_iam_role" {
  role_id     = "spannerServiceAccountInstanceManager"
  title       = "Spanner Autoscaler Instance Manager Role"
  description = "Allows a principal to modify spanner instances"
  permissions = ["spanner.instanceOperations.get", "spanner.instances.update"]
}

resource "google_project_iam_custom_role" "scaler_state_manager_iam_role" {
  role_id     = "spannerServiceAccountDatabaseUser"
  title       = "Spanner Autoscaler Database State Role"
  description = "Allows a principal to read/write data in Spanner"
  permissions = [
    "spanner.databases.beginOrRollbackReadWriteTransaction",
    "spanner.databases.write",
    "spanner.databases.select",
    "spanner.sessions.create",
    "spanner.sessions.delete"
  ]
}

