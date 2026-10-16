-- Backs ListProspectLeads (the lead-pool page for a single job) and the
-- "how many leads does this job have" count used by the Evaluate node's
-- sufficiency check. (workspace_id, job_id) is the canonical access path;
-- workspace_id is the membership gate, job_id scopes within the workspace.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospect_leads_workspace_job
    ON prospect_leads (workspace_id, job_id);
