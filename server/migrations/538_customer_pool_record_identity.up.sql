CREATE INDEX CONCURRENTLY customer_pool_record_identity_idx ON customer_pool_source_record (source_id, external_key, created_at DESC);
