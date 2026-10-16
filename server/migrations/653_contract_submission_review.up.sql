CREATE INDEX CONCURRENTLY idx_contract_submission_review ON contract_submission (workspace_id, review_id, created_at DESC);
