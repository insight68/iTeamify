-- Narrow the enumeration back to migration 613's list. Fails if any
-- contact_added / contact_deleted rows exist -- identical trade-off to the down
-- migrations of 558 / 562 / 574 / 613: rollback happens against a database whose
-- contacts can be re-added afterwards, and refusing to roll back beats deleting
-- audit history.
ALTER TABLE lead_activities
    DROP CONSTRAINT lead_activities_activity_type_check,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN (
            'created', 'updated', 'note', 'stage_changed', 'quote_accepted',
            'contact_captured', 'quote_sent', 'follow_up_requested',
            'review_changed', 'score_overridden', 'score_override_cleared',
            'score_assessed',
            'opportunity_created', 'opportunity_stage_changed', 'opportunity_updated',
            'settlement_changed', 'engagement_status_changed', 'service_order_paid',
            'parked', 'restored',
            'deleted', 'undeleted'
        ));
