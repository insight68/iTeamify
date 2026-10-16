-- One settings row per workspace (UpsertProspectSettings relies on this
-- unique index for ON CONFLICT (workspace_id) DO UPDATE). The
-- ProspectSettings page is singleton-shaped per workspace; the unique
-- index guarantees that invariant at the DB layer.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_prospect_settings_workspace
    ON prospect_settings (workspace_id);
