-- Workspace customer accounts (stable Account layer). Relationships are
-- application-managed soft references; no foreign keys or cascades.
-- Secondary indexes live in following single-statement CONCURRENTLY migrations.

CREATE TABLE accounts (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id                UUID NOT NULL,
    account_type                TEXT NOT NULL DEFAULT 'company'
        CHECK (account_type IN ('company', 'person')),
    display_name                TEXT NOT NULL,
    legal_name                  TEXT,
    domain                      TEXT NOT NULL DEFAULT '',
    website_url                 TEXT,
    country                     TEXT,
    industry                    TEXT,
    city                        TEXT,
    region                      TEXT,
    record_status               TEXT NOT NULL DEFAULT 'active'
        CHECK (record_status IN ('active', 'archived', 'merged')),
    merged_into_account_id      UUID,
    customer_since              TIMESTAMPTZ NOT NULL DEFAULT now(),
    owner_member_id             UUID,
    priority                    TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high')),
    notes                       TEXT,
    tags                        JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_fields               JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_contact_at            TIMESTAMPTZ,
    last_contact_at             TIMESTAMPTZ,
    next_follow_up_at           TIMESTAMPTZ,
    primary_opportunity_id      UUID,
    score_override              NUMERIC(5,2)
        CHECK (score_override IS NULL OR score_override BETWEEN 0 AND 100),
    score_override_reason       TEXT,
    score_override_by_member_id UUID,
    score_override_at           TIMESTAMPTZ,
    score_override_expires_at   TIMESTAMPTZ,
    parked_at                   TIMESTAMPTZ,
    park_reason                 TEXT,
    park_source                 TEXT,
    parked_by_member_id         UUID,
    billing_profile             JSONB NOT NULL DEFAULT '{}'::jsonb,
    pool_company_id             UUID,
    version                     INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(display_name)) > 0),
    CHECK (jsonb_typeof(tags) = 'array'),
    CHECK (jsonb_typeof(custom_fields) = 'object'),
    CHECK (jsonb_typeof(billing_profile) = 'object'),
    CONSTRAINT accounts_score_override_audit_check CHECK (
        (
            score_override IS NULL
            AND score_override_reason IS NULL
            AND score_override_by_member_id IS NULL
            AND score_override_at IS NULL
            AND score_override_expires_at IS NULL
        )
        OR (
            score_override IS NOT NULL
            AND length(trim(score_override_reason)) > 0
            AND score_override_by_member_id IS NOT NULL
            AND score_override_at IS NOT NULL
            AND (score_override_expires_at IS NULL OR score_override_expires_at > score_override_at)
        )
    ),
    CONSTRAINT accounts_park_audit_check CHECK (
        (
            parked_at IS NULL
            AND park_reason IS NULL
            AND park_source IS NULL
            AND parked_by_member_id IS NULL
        )
        OR (
            parked_at IS NOT NULL
            AND park_reason IS NOT NULL
            AND length(trim(both from park_reason)) > 0
            AND park_source IS NOT NULL
            AND park_source IN ('manual', 'system')
            AND ((park_source = 'manual') = (parked_by_member_id IS NOT NULL))
        )
    )
);

CREATE TABLE account_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    account_id       UUID NOT NULL,
    identity_type    TEXT NOT NULL
        CHECK (identity_type IN ('domain', 'email', 'phone', 'linkedin')),
    normalized_value TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_contacts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    account_id       UUID NOT NULL,
    full_name        TEXT,
    job_title        TEXT,
    email            TEXT,
    email_normalized TEXT,
    phone            TEXT,
    phone_e164       TEXT,
    whatsapp         TEXT,
    linkedin_url     TEXT,
    is_primary       BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_activities (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id              UUID NOT NULL,
    account_id                UUID NOT NULL,
    originating_lead_id       UUID,
    activity_type             TEXT NOT NULL,
    body                      TEXT,
    data                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_type                TEXT NOT NULL DEFAULT 'member'
        CHECK (actor_type IN ('member', 'agent', 'system')),
    actor_id                  UUID,
    task_id                   UUID,
    chat_session_id           UUID,
    chat_message_id           UUID,
    public_expert_session_id  UUID,
    occurred_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(data) = 'object')
);
