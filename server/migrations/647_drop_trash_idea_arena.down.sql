-- Recreate Trash Idea Arena exactly as migrations 437-453 left it, so
-- rolling back past 647 restores the tables, their indexes, and the
-- primary-key constraints. Index statements must stay non-transactional
-- (CONCURRENTLY), matching how 438-453 were originally applied.

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

-- Indexes (migrations 438-451, 453).
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_visitor_pkey ON trash_idea_visitor (id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_pkey ON trash_idea (id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_vote_pkey ON trash_idea_vote (id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_report_pkey ON trash_idea_report (id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_review_pkey ON trash_idea_review (id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_visitor_capability_uidx ON trash_idea_visitor (workspace_id, capability_hash);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_public_ref_uidx ON trash_idea (workspace_id, public_ref);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_vote_visitor_idea_uidx ON trash_idea_vote (workspace_id, visitor_id, idea_id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_vote_client_uidx ON trash_idea_vote (workspace_id, visitor_id, client_vote_id);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_report_visitor_idea_uidx ON trash_idea_report (workspace_id, visitor_id, idea_id);
CREATE INDEX CONCURRENTLY trash_idea_feed_idx ON trash_idea (workspace_id, status, content_locale, needs_review, published_at DESC);
CREATE INDEX CONCURRENTLY trash_idea_submitter_status_idx ON trash_idea (workspace_id, submitter_visitor_id, status, created_at DESC);
CREATE INDEX CONCURRENTLY trash_idea_review_idea_idx ON trash_idea_review (workspace_id, idea_id, created_at DESC);
CREATE UNIQUE INDEX CONCURRENTLY trash_idea_submission_client_uidx ON trash_idea (workspace_id, submitter_visitor_id, client_submission_id) WHERE source = 'visitor';
CREATE INDEX CONCURRENTLY trash_idea_review_created_idx ON trash_idea_review (workspace_id, created_at DESC, id DESC);

-- Primary-key constraints (migration 452).
ALTER TABLE trash_idea_visitor ADD CONSTRAINT trash_idea_visitor_pkey PRIMARY KEY USING INDEX trash_idea_visitor_pkey;
ALTER TABLE trash_idea ADD CONSTRAINT trash_idea_pkey PRIMARY KEY USING INDEX trash_idea_pkey;
ALTER TABLE trash_idea_vote ADD CONSTRAINT trash_idea_vote_pkey PRIMARY KEY USING INDEX trash_idea_vote_pkey;
ALTER TABLE trash_idea_report ADD CONSTRAINT trash_idea_report_pkey PRIMARY KEY USING INDEX trash_idea_report_pkey;
ALTER TABLE trash_idea_review ADD CONSTRAINT trash_idea_review_pkey PRIMARY KEY USING INDEX trash_idea_review_pkey;
