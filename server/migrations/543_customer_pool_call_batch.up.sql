CREATE UNIQUE INDEX CONCURRENTLY customer_pool_call_batch_idx ON customer_pool_provider_call (request_id, batch_key);
