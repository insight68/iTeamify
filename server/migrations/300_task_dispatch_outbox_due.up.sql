CREATE INDEX CONCURRENTLY task_dispatch_outbox_due_idx
    ON task_dispatch_outbox (next_attempt_at, created_at, id)
    WHERE status IN ('pending', 'processing');
