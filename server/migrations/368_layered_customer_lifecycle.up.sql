-- Split customer review, sales opportunity, settlement, and delivery into
-- separate domain objects. Small teams still get one primary operating stage,
-- while repeat purchases and parallel delivery no longer overwrite customer
-- identity. Relationships are application-managed soft references by design.

ALTER TABLE leads
    ADD COLUMN review_status TEXT NOT NULL DEFAULT 'review'
        CHECK (review_status IN ('review', 'approved', 'rejected')),
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN reviewed_by_member_id UUID,
    ADD COLUMN review_reason TEXT,
    ADD COLUMN primary_opportunity_id UUID,
    ADD COLUMN score_override NUMERIC(5,2)
        CHECK (score_override IS NULL OR score_override BETWEEN 0 AND 100),
    ADD COLUMN score_override_reason TEXT,
    ADD COLUMN score_override_by_member_id UUID,
    ADD COLUMN score_override_at TIMESTAMPTZ,
    ADD COLUMN score_override_expires_at TIMESTAMPTZ,
    ADD CONSTRAINT leads_score_override_audit_check CHECK (
        (score_override IS NULL
            AND score_override_reason IS NULL
            AND score_override_by_member_id IS NULL
            AND score_override_at IS NULL
            AND score_override_expires_at IS NULL)
        OR
        (score_override IS NOT NULL
            AND length(trim(score_override_reason)) > 0
            AND score_override_by_member_id IS NOT NULL
            AND score_override_at IS NOT NULL
            AND (score_override_expires_at IS NULL OR score_override_expires_at > score_override_at))
    );

CREATE TABLE lead_opportunity (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    title TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'contacted'
        CHECK (stage IN ('contacted', 'qualified', 'proposal', 'negotiating', 'won', 'lost')),
    owner_member_id UUID,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    expected_value_minor BIGINT
        CHECK (expected_value_minor IS NULL OR expected_value_minor >= 0),
    currency TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
    expected_close_date DATE,
    closed_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(title)) > 0),
    CHECK ((stage = 'won') = (won_at IS NOT NULL)),
    CHECK ((stage = 'lost') = (lost_at IS NOT NULL)),
    CHECK (stage NOT IN ('won', 'lost') OR won_at IS NULL OR lost_at IS NULL)
);

CREATE TABLE lead_assessment (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    audience_release_id UUID,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('lead_mining', 'agent', 'manual', 'migration')),
    fit_score NUMERIC(5,2)
        CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100),
    readiness_score NUMERIC(5,2)
        CHECK (readiness_score IS NULL OR readiness_score BETWEEN 0 AND 100),
    contactability_score NUMERIC(5,2)
        CHECK (contactability_score IS NULL OR contactability_score BETWEEN 0 AND 100),
    ranking_score NUMERIC(5,2) NOT NULL
        CHECK (ranking_score BETWEEN 0 AND 100),
    confidence NUMERIC(5,4)
        CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    tier TEXT CHECK (tier IS NULL OR tier IN ('A', 'B', 'C', 'D')),
    factors JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    unknowns JSONB NOT NULL DEFAULT '[]'::jsonb,
    exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
    method_version TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(method_version)) > 0),
    CHECK (jsonb_typeof(factors) = 'object'),
    CHECK (jsonb_typeof(evidence) = 'array'),
    CHECK (jsonb_typeof(unknowns) = 'array'),
    CHECK (jsonb_typeof(exclusions) = 'array')
);

CREATE TABLE service_engagement (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    opportunity_id UUID,
    order_id UUID,
    project_id UUID,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'onboarding', 'in_progress', 'live', 'paused', 'completed', 'cancelled')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    started_at TIMESTAMPTZ,
    live_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(title)) > 0),
    CHECK (status <> 'live' OR live_at IS NOT NULL),
    CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

ALTER TABLE service_quote ADD COLUMN opportunity_id UUID;
ALTER TABLE service_order ADD COLUMN opportunity_id UUID;

ALTER TABLE service_order
    DROP CONSTRAINT service_order_settlement_status_check,
    ADD CONSTRAINT service_order_settlement_status_check
        CHECK (settlement_status IN (
            'not_collected', 'pending', 'partially_paid', 'paid',
            'partially_refunded', 'refunded', 'failed', 'disputed'
        ));

UPDATE leads
SET review_status = CASE lifecycle_stage
        WHEN 'new' THEN 'review'
        WHEN 'disqualified' THEN 'rejected'
        ELSE 'approved'
    END,
    reviewed_at = CASE
        WHEN lifecycle_stage IN ('new') THEN NULL
        ELSE updated_at
    END,
    review_reason = CASE
        WHEN lifecycle_stage = 'disqualified' THEN 'Migrated from disqualified lifecycle stage'
        ELSE NULL
    END;

INSERT INTO lead_opportunity (
    workspace_id, lead_id, title, stage, owner_member_id, is_primary,
    won_at, lost_at, created_at, updated_at
)
SELECT
    workspace_id,
    id,
    display_name || ' opportunity',
    lifecycle_stage,
    owner_member_id,
    true,
    CASE WHEN lifecycle_stage = 'won' THEN updated_at END,
    CASE WHEN lifecycle_stage = 'lost' THEN updated_at END,
    created_at,
    updated_at
FROM leads
WHERE lifecycle_stage IN ('contacted', 'qualified', 'proposal', 'won', 'lost');

UPDATE leads AS lead
SET primary_opportunity_id = opportunity.id
FROM lead_opportunity AS opportunity
WHERE opportunity.workspace_id = lead.workspace_id
  AND opportunity.lead_id = lead.id
  AND opportunity.is_primary = true;

INSERT INTO lead_assessment (
    workspace_id, lead_id, source_type, fit_score, readiness_score,
    ranking_score, method_version, assessed_at, created_at
)
SELECT
    workspace_id,
    id,
    'migration',
    CASE
        WHEN quality_score BETWEEN 0 AND 1 THEN quality_score * 100
        ELSE quality_score
    END,
    CASE
        WHEN intent_score BETWEEN 0 AND 1 THEN intent_score * 100
        ELSE intent_score
    END,
    CASE
        WHEN quality_score IS NOT NULL AND intent_score IS NOT NULL THEN
            (CASE WHEN quality_score BETWEEN 0 AND 1 THEN quality_score * 100 ELSE quality_score END
             + CASE WHEN intent_score BETWEEN 0 AND 1 THEN intent_score * 100 ELSE intent_score END) / 2
        WHEN quality_score IS NOT NULL THEN
            CASE WHEN quality_score BETWEEN 0 AND 1 THEN quality_score * 100 ELSE quality_score END
        ELSE
            CASE WHEN intent_score BETWEEN 0 AND 1 THEN intent_score * 100 ELSE intent_score END
    END,
    'legacy-score-v1',
    updated_at,
    updated_at
FROM leads
WHERE quality_score IS NOT NULL OR intent_score IS NOT NULL;

UPDATE service_quote AS quote
SET opportunity_id = lead.primary_opportunity_id
FROM leads AS lead
WHERE quote.workspace_id = lead.workspace_id
  AND quote.lead_id = lead.id;

UPDATE service_order AS service_order
SET opportunity_id = lead.primary_opportunity_id
FROM leads AS lead
WHERE service_order.workspace_id = lead.workspace_id
  AND service_order.lead_id = lead.id;

INSERT INTO service_engagement (
    workspace_id, lead_id, opportunity_id, order_id, title,
    status, completed_at, created_at, updated_at
)
SELECT
    service_order.workspace_id,
    service_order.lead_id,
    service_order.opportunity_id,
    service_order.id,
    service_order.order_no,
    CASE WHEN service_order.status = 'fulfilled' THEN 'completed' ELSE 'pending' END,
    CASE WHEN service_order.status = 'fulfilled' THEN service_order.updated_at END,
    service_order.created_at,
    service_order.updated_at
FROM service_order
WHERE service_order.lead_id IS NOT NULL;

ALTER TABLE lead_activities
    DROP CONSTRAINT lead_activities_activity_type_check,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN (
            'created', 'updated', 'note', 'stage_changed', 'quote_accepted',
            'contact_captured', 'quote_sent', 'follow_up_requested',
            'review_changed', 'score_overridden', 'score_override_cleared',
            'opportunity_created', 'opportunity_stage_changed',
            'settlement_changed', 'engagement_status_changed'
        ));

ALTER TABLE leads
    DROP CONSTRAINT leads_lifecycle_stage_check,
    DROP CONSTRAINT leads_quality_score_check,
    DROP CONSTRAINT leads_intent_score_check,
    DROP COLUMN lifecycle_stage,
    DROP COLUMN quality_score,
    DROP COLUMN intent_score;
