CREATE INDEX CONCURRENTLY idx_leads_workspace_review
    ON leads (workspace_id, review_status, updated_at DESC);
