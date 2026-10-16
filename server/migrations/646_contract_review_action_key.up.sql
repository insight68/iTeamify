CREATE UNIQUE INDEX CONCURRENTLY idx_contract_review_action_key ON contract_review_action (review_id, request_key);
