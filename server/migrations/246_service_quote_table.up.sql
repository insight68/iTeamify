CREATE INDEX CONCURRENTLY service_quote_workspace_status_created_idx ON service_quote (workspace_id, status, created_at DESC);
