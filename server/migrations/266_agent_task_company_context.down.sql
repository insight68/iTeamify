ALTER TABLE agent_task_queue
    DROP COLUMN IF EXISTS company_context_pinned_at,
    DROP COLUMN IF EXISTS company_release_version,
    DROP COLUMN IF EXISTS company_release_id;
