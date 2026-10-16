CREATE INDEX CONCURRENTLY workspace_provisioning_operation_workspace_idx ON workspace_provisioning_operation (workspace_id, created_at DESC, id DESC);
