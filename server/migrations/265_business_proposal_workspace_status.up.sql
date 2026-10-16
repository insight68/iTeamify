CREATE INDEX CONCURRENTLY idx_business_proposal_workspace_status ON business_change_proposal (workspace_id, status, created_at DESC);
