CREATE UNIQUE INDEX CONCURRENTLY workspace_provisioning_operation_created_uidx ON workspace_provisioning_operation (workspace_id, assembly_release_id) WHERE trigger = 'workspace_created';
