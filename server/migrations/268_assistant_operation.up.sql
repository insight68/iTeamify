CREATE TABLE assistant_operation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'failed')),
    risk TEXT NOT NULL
        CHECK (risk IN ('read', 'low', 'medium', 'high')),
    confirmation_type TEXT NOT NULL DEFAULT 'none'
        CHECK (confirmation_type IN ('none', 'explicit')),
    originator_user_id UUID,
    agent_id UUID NOT NULL,
    task_id UUID NOT NULL,
    chat_session_id UUID NOT NULL,
    user_intent_message_id UUID,
    idempotency_key TEXT NOT NULL,
    expected_version INTEGER,
    request JSONB NOT NULL DEFAULT '{}'::jsonb,
    preview JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CHECK (jsonb_typeof(request) = 'object'),
    CHECK (jsonb_typeof(preview) = 'object'),
    CHECK (jsonb_typeof(result) = 'object'),
    CHECK (length(idempotency_key) BETWEEN 1 AND 200)
);
