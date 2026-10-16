-- Backs the "timeline of events for a job" scan (used by the job-detail
-- view and by audit / replay). (job_id, created_at) gives the natural
-- chronological order; workspace_id is on the row for the application
-- layer's membership gate but is not in this index because the access
-- path is always "given a job_id (already membership-checked), list
-- events in time order".
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prospect_job_events_job
    ON prospect_job_events (job_id, created_at);
