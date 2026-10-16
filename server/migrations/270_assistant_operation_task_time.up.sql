CREATE INDEX CONCURRENTLY assistant_operation_task_time_idx
    ON assistant_operation (task_id, created_at DESC);
