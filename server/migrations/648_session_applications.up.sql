CREATE TABLE session_application (
    id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    application_type TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('member', 'agent')),
    target_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'enabled', 'paused')),
    config JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE chat_session ADD COLUMN application_id UUID, ADD COLUMN application_version INTEGER;
ALTER TABLE contract_review ADD COLUMN application_id UUID, ADD COLUMN application_version INTEGER,
    ADD COLUMN application_snapshot JSONB;
CREATE TABLE contract_submission (
    id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    review_id UUID NOT NULL,
    submitted_by UUID NOT NULL,
    review_version INTEGER NOT NULL,
    task_id UUID NOT NULL,
    input JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
