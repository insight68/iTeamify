CREATE TABLE public_expert_retention_run (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    policy_version TEXT NOT NULL,
    cutoff TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    expired_session_count BIGINT NOT NULL DEFAULT 0 CHECK (expired_session_count >= 0),
    purged_anonymous_session_count BIGINT NOT NULL DEFAULT 0 CHECK (purged_anonymous_session_count >= 0),
    deleted_message_count BIGINT NOT NULL DEFAULT 0 CHECK (deleted_message_count >= 0),
    deleted_event_count BIGINT NOT NULL DEFAULT 0 CHECK (deleted_event_count >= 0),
    deleted_task_count BIGINT NOT NULL DEFAULT 0 CHECK (deleted_task_count >= 0),
    deleted_pending_action_count BIGINT NOT NULL DEFAULT 0 CHECK (deleted_pending_action_count >= 0),
    deleted_usage_reservation_count BIGINT NOT NULL DEFAULT 0 CHECK (deleted_usage_reservation_count >= 0),
    stale_runtime_instance_count BIGINT NOT NULL DEFAULT 0 CHECK (stale_runtime_instance_count >= 0),
    error_code TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CHECK (length(policy_version) BETWEEN 1 AND 100),
    CHECK (length(error_code) <= 100)
);
