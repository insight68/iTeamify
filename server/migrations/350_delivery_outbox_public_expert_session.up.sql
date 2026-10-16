CREATE INDEX CONCURRENTLY delivery_outbox_public_expert_session_idx
    ON delivery_outbox (aggregate_id)
    WHERE aggregate_type = 'public_expert_session';
