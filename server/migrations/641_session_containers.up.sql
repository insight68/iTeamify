ALTER TABLE chat_session
    ADD COLUMN container_type TEXT NOT NULL DEFAULT 'conversation',
    ADD COLUMN container_resource_type TEXT,
    ADD COLUMN container_resource_id UUID,
    ADD COLUMN last_activity_at TIMESTAMPTZ;

CREATE TABLE contract_review (
    id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    fields JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'needs_info', 'in_review', 'completed')),
    result TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    creator_read_version INTEGER NOT NULL DEFAULT 1,
    peer_read_version INTEGER NOT NULL DEFAULT 0,
    last_actor_id UUID NOT NULL,
    submission_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contract_review_file (
    id UUID NOT NULL,
    review_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    uploaded_by UUID NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
    object_key TEXT NOT NULL,
    encryption_key BYTEA NOT NULL CHECK (octet_length(encryption_key) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
