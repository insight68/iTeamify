ALTER TABLE leads
    ADD COLUMN quality_score NUMERIC,
    ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'new',
    ADD COLUMN intent_score NUMERIC,
    ADD CONSTRAINT leads_lifecycle_stage_check
        CHECK (lifecycle_stage IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'disqualified')),
    ADD CONSTRAINT leads_quality_score_check
        CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
    ADD CONSTRAINT leads_intent_score_check
        CHECK (intent_score IS NULL OR intent_score BETWEEN 0 AND 100);

UPDATE leads AS lead
SET lifecycle_stage = CASE
        WHEN lead.review_status = 'rejected' THEN 'disqualified'
        WHEN lead.primary_opportunity_id IS NOT NULL THEN COALESCE((
            SELECT opportunity.stage
            FROM lead_opportunity AS opportunity
            WHERE opportunity.workspace_id = lead.workspace_id
              AND opportunity.lead_id = lead.id
              AND opportunity.id = lead.primary_opportunity_id
            LIMIT 1
        ), 'new')
        ELSE 'new'
    END;

UPDATE leads AS lead
SET quality_score = assessment.fit_score,
    intent_score = assessment.readiness_score
FROM (
    SELECT DISTINCT ON (workspace_id, lead_id)
        workspace_id,
        lead_id,
        fit_score,
        readiness_score
    FROM lead_assessment
    ORDER BY workspace_id, lead_id, assessed_at DESC, id DESC
) AS assessment
WHERE assessment.workspace_id = lead.workspace_id
  AND assessment.lead_id = lead.id;

UPDATE lead_activities
SET activity_type = 'updated'
WHERE activity_type IN (
    'review_changed', 'score_overridden', 'score_override_cleared',
    'opportunity_created', 'opportunity_stage_changed',
    'settlement_changed', 'engagement_status_changed'
);

ALTER TABLE lead_activities
    DROP CONSTRAINT lead_activities_activity_type_check,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN (
            'created', 'updated', 'note', 'stage_changed', 'quote_accepted',
            'contact_captured', 'quote_sent', 'follow_up_requested'
        ));

UPDATE service_order
SET settlement_status = 'not_collected'
WHERE settlement_status <> 'not_collected';

ALTER TABLE service_order
    DROP CONSTRAINT service_order_settlement_status_check,
    ADD CONSTRAINT service_order_settlement_status_check
        CHECK (settlement_status IN ('not_collected')),
    DROP COLUMN opportunity_id;

ALTER TABLE service_quote DROP COLUMN opportunity_id;

DROP TABLE service_engagement;
DROP TABLE lead_assessment;
DROP TABLE lead_opportunity;

ALTER TABLE leads
    DROP CONSTRAINT leads_score_override_audit_check,
    DROP COLUMN review_status,
    DROP COLUMN reviewed_at,
    DROP COLUMN reviewed_by_member_id,
    DROP COLUMN review_reason,
    DROP COLUMN primary_opportunity_id,
    DROP COLUMN score_override,
    DROP COLUMN score_override_reason,
    DROP COLUMN score_override_by_member_id,
    DROP COLUMN score_override_at,
    DROP COLUMN score_override_expires_at;
