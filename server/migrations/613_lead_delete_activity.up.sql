-- Deleting and restoring a lead each write an activity row, and activity_type is
-- a closed enumeration: a value that is not listed here fails at runtime with a
-- raw constraint violation. Follows the DROP+ADD shape of 558 / 562 / 574, and
-- the list below is migration 574's list verbatim plus the two new values --
-- dropping any existing value would silently break that event kind instead.
--
-- `undeleted` rather than reusing `restored`: `restored` already means "un-park"
-- (migration 562), and ListAutoParkCandidates reads activity_type='restored' for
-- its re-park cooldown -- so overloading it would feed delete events into the
-- parking automation.
--
-- Differs from 574 in one deliberate way: ADD ... NOT VALID + a separate
-- VALIDATE. lead_activities is the hottest table in the schema -- append-only,
-- one row per activity, and the largest by row count -- so the default
-- validating ADD (ACCESS EXCLUSIVE + full scan) would be a minutes-long outage
-- at production scale. NOT VALID still enforces on every new write; VALIDATE
-- then does the scan under SHARE UPDATE EXCLUSIVE without blocking readers or
-- writers. Migration 574's inline-validating form predates that lesson; 191 is
-- the precedent for this shape.
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
        )) NOT VALID;
ALTER TABLE lead_activities VALIDATE CONSTRAINT lead_activities_activity_type_check;
