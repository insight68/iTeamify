CREATE INDEX CONCURRENTLY workspace_credit_operation_due_idx ON workspace_credit_operation_outbox (next_attempt_at, created_at, id) WHERE status IN ('pending', 'processing');
