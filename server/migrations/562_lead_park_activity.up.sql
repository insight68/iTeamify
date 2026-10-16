-- Shelving a lead writes its own activity rows, and activity_type is a closed
-- enumeration -- without these values the park/restore write fails at runtime
-- with a raw constraint violation. Follows the DROP+ADD shape of migration 558.
--
-- The down migration narrows the list back and therefore fails if any parked or
-- restored rows already exist. That is the same trade-off migration 558's down
-- makes, and it is acceptable here because rollback happens against a database
-- whose leads can be un-parked first; the alternative (deleting audit history)
-- would be worse than refusing to roll back.
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
