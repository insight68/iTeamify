CREATE INDEX CONCURRENTLY managed_asset_candidate_review_queue_idx ON managed_asset_candidate (status, created_at, id);
