CREATE UNIQUE INDEX CONCURRENTLY assistant_operation_workspace_idempotency_uidx
    ON assistant_operation (workspace_id, idempotency_key);
