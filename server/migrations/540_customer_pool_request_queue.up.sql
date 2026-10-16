CREATE INDEX CONCURRENTLY customer_pool_request_queue_idx ON customer_pool_request (next_attempt_at, created_at) WHERE status IN ('queued','running');
