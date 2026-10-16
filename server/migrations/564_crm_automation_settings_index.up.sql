-- One settings row per workspace. UpsertWorkspaceCRMAutomationSettings relies on
-- this unique index for ON CONFLICT (workspace_id) DO UPDATE, so the singleton
-- invariant is enforced by the database instead of by service-layer care.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_crm_automation_settings_workspace
    ON workspace_crm_automation_settings (workspace_id);
