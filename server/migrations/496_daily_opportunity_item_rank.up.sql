CREATE UNIQUE INDEX CONCURRENTLY daily_opportunity_item_rank_idx ON daily_opportunity_item (edition_id, rank) WHERE status = 'active';
