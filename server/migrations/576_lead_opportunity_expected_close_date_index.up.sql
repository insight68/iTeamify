-- Backs sorting and windowing the open pipeline by our own forecast close
-- date. Partial on open stages and non-null dates for the same reason as 575:
-- the forecast view is about deals we expect to land, and a null forecast is
-- simply absent from it rather than sorted to one end.
--
-- Single statement in its own file: CREATE INDEX CONCURRENTLY cannot run inside
-- the implicit transaction the migration runner wraps multi-statement files in.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_opportunity_workspace_expected_close_date
    ON lead_opportunity (workspace_id, expected_close_date)
    WHERE stage NOT IN ('won', 'lost') AND expected_close_date IS NOT NULL;
