-- Trash Idea Arena persistence. Relationships are application-managed soft
-- references: this schema intentionally has no foreign keys or cascades.
-- Every index is created by a following single-statement CONCURRENTLY migration.

CREATE TABLE trash_idea_visitor (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    capability_hash BYTEA NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'blocked', 'expired')),
    qualified_vote_count INTEGER NOT NULL DEFAULT 0
        CHECK (qualified_vote_count >= 0),
    spent_credit_count INTEGER NOT NULL DEFAULT 0
        CHECK (spent_credit_count >= 0),
    preferred_locale TEXT NOT NULL DEFAULT 'zh-Hans'
        CHECK (preferred_locale IN ('en', 'zh-Hans')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days'),
    CHECK (octet_length(capability_hash) = 32),
    CHECK (spent_credit_count <= qualified_vote_count / 10),
    CHECK (expires_at > created_at)
);

CREATE TABLE trash_idea (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    public_ref TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    submitter_visitor_id UUID,
    source TEXT NOT NULL DEFAULT 'visitor'
        CHECK (source IN ('visitor', 'editorial_seed')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'rejected', 'archived', 'withdrawn')),
    content_locale TEXT NOT NULL
        CHECK (content_locale IN ('en', 'zh-Hans')),
    title TEXT NOT NULL,
    pitch TEXT NOT NULL,
    target_user TEXT NOT NULL,
    category TEXT NOT NULL
        CHECK (category IN ('ai', 'developer_tools', 'productivity', 'marketing_sales', 'consumer', 'other')),
    client_submission_id TEXT,
    normalized_content_hash BYTEA NOT NULL,
    trash_vote_count INTEGER NOT NULL DEFAULT 0 CHECK (trash_vote_count >= 0),
    fire_vote_count INTEGER NOT NULL DEFAULT 0 CHECK (fire_vote_count >= 0),
    needs_review BOOLEAN NOT NULL DEFAULT false,
    rules_accepted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(public_ref) BETWEEN 22 AND 128),
    CHECK (octet_length(normalized_content_hash) = 32),
    CHECK (char_length(title) BETWEEN 4 AND 60),
    CHECK (char_length(pitch) BETWEEN 20 AND 280),
    CHECK (char_length(target_user) BETWEEN 2 AND 80),
    CHECK (client_submission_id IS NULL OR length(client_submission_id) BETWEEN 8 AND 200),
    CHECK (
        (source = 'visitor' AND submitter_visitor_id IS NOT NULL
            AND client_submission_id IS NOT NULL AND rules_accepted_at IS NOT NULL)
        OR (source = 'editorial_seed' AND submitter_visitor_id IS NULL
            AND client_submission_id IS NULL)
    ),
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE TABLE trash_idea_vote (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    visitor_id UUID NOT NULL,
    idea_id UUID NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('trash', 'fire')),
    client_vote_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(client_vote_id) BETWEEN 8 AND 200)
);

CREATE TABLE trash_idea_report (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    visitor_id UUID NOT NULL,
    idea_id UUID NOT NULL,
    reason_code TEXT NOT NULL
        CHECK (reason_code IN ('personal_data', 'harassment', 'hate', 'illegal', 'spam', 'copied', 'other')),
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewed', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    CHECK (char_length(detail) <= 200)
);

CREATE TABLE trash_idea_review (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    idea_id UUID NOT NULL,
    actor_user_id UUID NOT NULL,
    action TEXT NOT NULL
        CHECK (action IN ('publish', 'reject', 'archive', 'restore', 'refund_credit')),
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    reason_code TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    idea_version INTEGER NOT NULL CHECK (idea_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (char_length(reason_code) <= 100),
    CHECK (char_length(note) <= 1000)
);
