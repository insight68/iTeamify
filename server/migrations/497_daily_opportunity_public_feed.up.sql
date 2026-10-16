CREATE INDEX CONCURRENTLY daily_opportunity_public_feed_idx ON daily_opportunity_edition (status, edition_date DESC, published_at DESC);
