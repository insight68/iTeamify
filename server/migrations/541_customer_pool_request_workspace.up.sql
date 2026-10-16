CREATE INDEX CONCURRENTLY customer_pool_request_workspace_idx ON customer_pool_request (workspace_id, created_at DESC);
