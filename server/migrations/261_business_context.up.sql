-- Workspace-level business truth used by agents and lead mining.
--
-- Relationships are application-managed soft references. No FOREIGN KEY or
-- cascading action is used. Secondary and unique indexes are created in the
-- following single-statement CONCURRENTLY migrations.

CREATE TABLE business_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
    published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
    draft_content JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_content JSONB,
    updated_by_user_id UUID,
    published_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    CHECK (jsonb_typeof(draft_content) = 'object'),
    CHECK (published_content IS NULL OR jsonb_typeof(published_content) = 'object')
);

CREATE TABLE business_release (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    draft_revision INTEGER NOT NULL CHECK (draft_revision > 0),
    content JSONB NOT NULL,
    change_summary TEXT NOT NULL DEFAULT '',
    published_by_user_id UUID NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(content) = 'object')
);

CREATE TABLE business_change_proposal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    chat_session_id UUID,
    source_task_id UUID,
    base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
    title TEXT NOT NULL,
    rationale TEXT NOT NULL DEFAULT '',
    operations JSONB NOT NULL,
    source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'applied', 'partially_applied', 'rejected', 'superseded', 'stale')),
    created_by_actor_type TEXT NOT NULL
        CHECK (created_by_actor_type IN ('agent', 'member', 'system')),
    created_by_actor_id UUID,
    applied_revision INTEGER,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(operations) = 'array'),
    CHECK (jsonb_typeof(source_refs) = 'array')
);
