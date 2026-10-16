-- Mutable editorial candidates and anonymous funnel events for Daily Opportunities.
-- Relationships are application-managed soft references: no foreign keys or cascades.
-- Indexes are created by following single-statement CONCURRENTLY migrations.

ALTER TABLE daily_opportunity_item
    ADD COLUMN source_candidate_id UUID;

CREATE TABLE daily_opportunity_candidate (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    target_edition_date DATE NOT NULL,
    source_job_id UUID,
    source_lead_id UUID,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'watching', 'accepted', 'rejected', 'selected')),
    draft JSONB NOT NULL DEFAULT '{}'::jsonb,
    score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
    score_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_flags TEXT[] NOT NULL DEFAULT '{}',
    source_fingerprint BYTEA NOT NULL,
    source_observed_at TIMESTAMPTZ NOT NULL,
    decision_reason TEXT NOT NULL DEFAULT '',
    decided_by_user_id UUID,
    decided_at TIMESTAMPTZ,
    selected_edition_id UUID,
    selected_item_id UUID,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(draft) = 'object'),
    CHECK (jsonb_typeof(score_reasons) = 'object'),
    CHECK (octet_length(source_fingerprint) = 32),
    CHECK (char_length(decision_reason) <= 1000),
    CHECK (status NOT IN ('accepted', 'rejected', 'selected') OR decided_at IS NOT NULL),
    CHECK (status <> 'selected' OR (selected_edition_id IS NOT NULL AND selected_item_id IS NOT NULL))
);

CREATE TABLE daily_opportunity_event (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    edition_id UUID NOT NULL,
    item_id UUID,
    event_type TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (char_length(event_type) BETWEEN 3 AND 80)
);
