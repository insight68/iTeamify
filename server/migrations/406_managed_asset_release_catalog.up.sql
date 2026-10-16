CREATE INDEX CONCURRENTLY managed_asset_release_catalog_idx ON managed_asset_release (asset_type, status, created_at DESC, id);
