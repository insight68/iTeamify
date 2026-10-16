ALTER TABLE public_expert_retention_run
    ADD COLUMN deleted_ephemeral_event_count BIGINT NOT NULL DEFAULT 0
        CHECK (deleted_ephemeral_event_count >= 0),
    ADD COLUMN purged_session_event_count BIGINT NOT NULL DEFAULT 0
        CHECK (purged_session_event_count >= 0),
    ADD COLUMN cancelled_task_count BIGINT NOT NULL DEFAULT 0
        CHECK (cancelled_task_count >= 0),
    ADD COLUMN settled_started_reservation_count BIGINT NOT NULL DEFAULT 0
        CHECK (settled_started_reservation_count >= 0),
    ADD COLUMN released_reserved_reservation_count BIGINT NOT NULL DEFAULT 0
        CHECK (released_reserved_reservation_count >= 0),
    ADD COLUMN dead_lettered_dispatch_count BIGINT NOT NULL DEFAULT 0
        CHECK (dead_lettered_dispatch_count >= 0);
