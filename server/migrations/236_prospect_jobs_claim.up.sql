-- Partial index backing ClaimQueuedProspectJob's
-- "WHERE workspace_id = $1 AND status = 'queued'
--      AND (lease_expires_at IS NULL OR lease_expires_at <= now())"
-- scan. Restricting to status = 'queued' keeps the index tiny — terminal
-- rows (succeeded/failed/cancelled) accumulate forever but are excluded,
-- so the index stays bounded by current queue depth (mirrors the 067
-- idx_agent_task_queue_claim_candidates pattern).
-- ORDER BY created_at ASC mirrors the claim SELECT so the planner can
-- serve it as an index-only scan without an extra sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospect_jobs_claim
    ON prospect_jobs (workspace_id, created_at ASC)
    WHERE status = 'queued';
