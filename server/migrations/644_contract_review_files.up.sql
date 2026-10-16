CREATE INDEX CONCURRENTLY idx_contract_review_files ON contract_review_file (workspace_id, review_id, created_at);
