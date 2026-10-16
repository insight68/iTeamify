-- Native Gmail credentials belong to a iTeamify user. Workspace routing is kept
-- in gmail_analysis_binding so one mailbox can be used in more than one
-- workspace without duplicating or weakening credential ownership.
CREATE TABLE user_gmail_connection (
    id                       UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL,
    email_address            TEXT NOT NULL,
    refresh_token_ciphertext BYTEA NOT NULL,
    granted_scopes           TEXT[] NOT NULL DEFAULT '{}',
    status                   TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'attention', 'disconnected')),
    history_id               TEXT,
    watch_expiration         TIMESTAMPTZ,
    last_sync_at             TIMESTAMPTZ,
    last_error_code          TEXT,
    last_error_at            TIMESTAMPTZ,
    connected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    disconnected_at          TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OAuth states are opaque, single-use, and short-lived. Only a SHA-256 hash of
-- the browser-visible state is stored, so a database read cannot mint a valid
-- callback URL.
CREATE TABLE gmail_oauth_state (
    state_hash    BYTEA NOT NULL,
    user_id       UUID NOT NULL,
    workspace_id  UUID NOT NULL,
    return_path   TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analysis is workspace-scoped even though the credential is user-scoped.
-- recipient_user_id is materialized deliberately: it is the inbox recipient
-- and prevents a later membership change from silently redirecting results.
CREATE TABLE gmail_analysis_binding (
    id                UUID NOT NULL DEFAULT gen_random_uuid(),
    connection_id     UUID NOT NULL,
    workspace_id      UUID NOT NULL,
    recipient_user_id UUID NOT NULL,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    notify_threshold  TEXT NOT NULL DEFAULT 'action_required'
        CHECK (notify_threshold IN ('action_required', 'attention', 'all')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One coalescing job per mailbox. generation is incremented for every push or
-- fallback poll. A worker may mark a job idle only when the generation it
-- claimed is still current, preventing a push received during processing from
-- being lost.
CREATE TABLE gmail_sync_job (
    connection_id    UUID NOT NULL,
    generation       BIGINT NOT NULL DEFAULT 1,
    target_history_id TEXT,
    status           TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'idle')),
    available_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempt_count    INTEGER NOT NULL DEFAULT 0,
    lease_owner      TEXT,
    lease_expires_at TIMESTAMPTZ,
    last_error_code  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message bodies are intentionally bounded by the sync service before write.
-- Attachments are not copied in v1; Gmail remains their source of truth.
CREATE TABLE gmail_message (
    id                     UUID NOT NULL DEFAULT gen_random_uuid(),
    connection_id          UUID NOT NULL,
    gmail_message_id       TEXT NOT NULL,
    gmail_thread_id        TEXT NOT NULL,
    gmail_history_id       TEXT,
    internal_date          TIMESTAMPTZ NOT NULL,
    sender                 TEXT NOT NULL DEFAULT '',
    recipients             TEXT NOT NULL DEFAULT '',
    subject                TEXT NOT NULL DEFAULT '',
    snippet                TEXT NOT NULL DEFAULT '',
    body_text              TEXT NOT NULL DEFAULT '',
    label_ids              TEXT[] NOT NULL DEFAULT '{}',
    size_estimate          BIGINT NOT NULL DEFAULT 0,
    analysis_status        TEXT NOT NULL DEFAULT 'pending'
        CHECK (analysis_status IN ('pending', 'processing', 'completed', 'skipped', 'failed')),
    analysis_attempt_count INTEGER NOT NULL DEFAULT 0,
    analysis_available_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    analysis_lease_owner   TEXT,
    analysis_lease_expires_at TIMESTAMPTZ,
    analysis_result        JSONB,
    analysis_error_code    TEXT,
    analyzed_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
