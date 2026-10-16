CREATE INDEX CONCURRENTLY idx_business_release_workspace_published ON business_release (workspace_id, published_at DESC);
