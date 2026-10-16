CREATE INDEX CONCURRENTLY service_order_workspace_status_created_idx ON service_order (workspace_id, status, created_at DESC);
