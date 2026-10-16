-- Backs the "list jobs for this workspace, optionally filtered by status"
-- query (ListProspectJobs). Status is the dominant filter dimension on the
-- task board UI; workspace_id is the membership gate. CONCURRENTLY avoids
-- blocking writes during build (matches the pattern in 074/080/106).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospect_jobs_workspace_status
    ON prospect_jobs (workspace_id, status);
