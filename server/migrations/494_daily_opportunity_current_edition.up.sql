CREATE UNIQUE INDEX CONCURRENTLY daily_opportunity_current_edition_idx ON daily_opportunity_edition (market, edition_date) WHERE status = 'published';
