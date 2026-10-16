CREATE INDEX CONCURRENTLY daily_opportunity_event_metrics_idx ON daily_opportunity_event (workspace_id, edition_id, event_type, occurred_at DESC);
