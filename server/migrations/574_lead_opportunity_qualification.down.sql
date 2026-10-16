-- Reverts 574. Narrowing activity_type back fails once any row already carries
-- 'opportunity_updated' or 'service_order_paid' -- the same trade-off
-- migrations 558 and 562 accept in their own downs. Rolling back is done
-- against a database whose opportunities can be re-opened first; the
-- alternative (deleting audit history) is worse than refusing to roll back.
ALTER TABLE lead_activities
    DROP CONSTRAINT lead_activities_activity_type_check,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN (
            'created', 'updated', 'note', 'stage_changed', 'quote_accepted',
            'contact_captured', 'quote_sent', 'follow_up_requested',
            'review_changed', 'score_overridden', 'score_override_cleared',
            'score_assessed',
            'opportunity_created', 'opportunity_stage_changed',
            'settlement_changed', 'engagement_status_changed',
            'parked', 'restored'
        ));

ALTER TABLE lead_contacts
    DROP COLUMN buying_role;

ALTER TABLE lead_opportunity
    DROP CONSTRAINT lead_opportunity_need_summary_length_check,
    DROP CONSTRAINT lead_opportunity_budget_note_length_check,
    DROP CONSTRAINT lead_opportunity_customer_timeline_note_length_check,
    DROP COLUMN need_summary,
    DROP COLUMN budget_confirmed,
    DROP COLUMN budget_note,
    DROP COLUMN decision_maker_contact_id,
    DROP COLUMN customer_timeline,
    DROP COLUMN customer_timeline_note;
