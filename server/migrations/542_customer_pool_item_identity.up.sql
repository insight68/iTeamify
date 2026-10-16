CREATE UNIQUE INDEX CONCURRENTLY customer_pool_item_identity_idx ON customer_pool_request_item (request_id, object_key);
