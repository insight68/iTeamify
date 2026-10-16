CREATE TABLE chat_context_resource (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    chat_session_id UUID NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_version INTEGER,
    label TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'page'
        CHECK (source IN ('page', 'user', 'system')),
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(resource_type) BETWEEN 1 AND 100),
    CHECK (length(resource_id) BETWEEN 1 AND 200),
    CHECK (resource_version IS NULL OR resource_version >= 0)
);
