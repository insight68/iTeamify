CREATE UNIQUE INDEX CONCURRENTLY customer_pool_record_replay_idx ON customer_pool_source_record (source_id, external_key, content_hash);
