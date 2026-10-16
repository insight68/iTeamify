CREATE UNIQUE INDEX CONCURRENTLY daily_opportunity_edition_revision_idx ON daily_opportunity_edition (workspace_id, market, edition_date, revision);
