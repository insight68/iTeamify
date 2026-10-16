CREATE INDEX CONCURRENTLY delivery_outbox_due_idx
    ON delivery_outbox (next_attempt_at, created_at, id)
    WHERE status IN ('pending', 'processing');
