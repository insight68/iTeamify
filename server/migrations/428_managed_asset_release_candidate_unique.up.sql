CREATE UNIQUE INDEX CONCURRENTLY managed_asset_release_candidate_uidx ON managed_asset_release (candidate_id) WHERE candidate_id IS NOT NULL;
