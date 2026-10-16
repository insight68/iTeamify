ALTER TABLE public_expert_retention_run
    DROP COLUMN IF EXISTS deleted_ephemeral_event_count,
    DROP COLUMN IF EXISTS purged_session_event_count,
    DROP COLUMN IF EXISTS cancelled_task_count,
    DROP COLUMN IF EXISTS settled_started_reservation_count,
    DROP COLUMN IF EXISTS released_reserved_reservation_count,
    DROP COLUMN IF EXISTS dead_lettered_dispatch_count;
