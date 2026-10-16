ALTER TABLE leads DROP CONSTRAINT IF EXISTS prospect_leads_market_language_check;
ALTER TABLE leads ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN dedup_key DROP NOT NULL;
ALTER TABLE leads RENAME COLUMN status TO lifecycle_stage;

ALTER TABLE leads
    ADD COLUMN lead_type TEXT NOT NULL DEFAULT 'company'
        CHECK (lead_type IN ('company', 'person', 'unknown')),
    ADD COLUMN display_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN website_url TEXT,
    ADD COLUMN industry TEXT,
    ADD COLUMN city TEXT,
    ADD COLUMN region TEXT,
    ADD COLUMN record_status TEXT NOT NULL DEFAULT 'active'
        CHECK (record_status IN ('active', 'archived', 'merged')),
    ADD COLUMN owner_member_id UUID,
    ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high')),
    ADD COLUMN intent_score NUMERIC,
    ADD COLUMN notes TEXT,
    ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN first_contact_at TIMESTAMPTZ,
    ADD COLUMN last_contact_at TIMESTAMPTZ,
    ADD COLUMN next_follow_up_at TIMESTAMPTZ,
    ADD COLUMN merged_into_lead_id UUID,
    ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD CONSTRAINT leads_lifecycle_stage_check
        CHECK (lifecycle_stage IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'disqualified')),
    ADD CONSTRAINT leads_quality_score_check
        CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
    ADD CONSTRAINT leads_intent_score_check
        CHECK (intent_score IS NULL OR (intent_score >= 0 AND intent_score <= 100)),
    ADD CONSTRAINT leads_version_check CHECK (version > 0),
    ADD CONSTRAINT leads_tags_check CHECK (jsonb_typeof(tags) = 'array'),
    ADD CONSTRAINT leads_custom_fields_check CHECK (jsonb_typeof(custom_fields) = 'object');

CREATE TABLE lead_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    full_name TEXT,
    job_title TEXT,
    email TEXT,
    email_normalized TEXT,
    phone TEXT,
    phone_e164 TEXT,
    whatsapp TEXT,
    linkedin_url TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lead_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    identity_type TEXT NOT NULL
        CHECK (identity_type IN ('domain', 'email', 'phone', 'linkedin')),
    normalized_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('lead_mining', 'chat', 'manual', 'quote', 'import', 'api')),
    source_key TEXT NOT NULL,
    lead_mining_job_id UUID,
    task_id UUID,
    chat_session_id UUID,
    chat_message_id UUID,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    activity_type TEXT NOT NULL
        CHECK (activity_type IN ('created', 'updated', 'note', 'stage_changed', 'quote_accepted')),
    body TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_type TEXT NOT NULL DEFAULT 'member'
        CHECK (actor_type IN ('member', 'agent', 'system')),
    actor_id UUID,
    task_id UUID,
    chat_session_id UUID,
    chat_message_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(data) = 'object')
);

ALTER TABLE service_quote ADD COLUMN lead_id UUID;
ALTER TABLE service_order ADD COLUMN lead_id UUID;
