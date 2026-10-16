CREATE INDEX CONCURRENTLY daily_opportunity_candidate_inbox_idx ON daily_opportunity_candidate (workspace_id, target_edition_date DESC, status, score DESC, created_at DESC);
