-- Pin the immutable published company release used by an agent task.
-- Relationships are application-managed; intentionally no foreign key.
ALTER TABLE agent_task_queue
    ADD COLUMN company_release_id UUID,
    ADD COLUMN company_release_version INTEGER,
    ADD COLUMN company_context_pinned_at TIMESTAMPTZ;
