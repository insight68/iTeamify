CREATE INDEX CONCURRENTLY idx_leads_workspace_pipeline
    ON leads (workspace_id, lifecycle_stage, updated_at DESC);
