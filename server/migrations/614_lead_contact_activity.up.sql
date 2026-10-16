-- Adding or removing a contact writes an activity row, and activity_type is a
-- closed enumeration: a value that is not listed here fails at runtime with a raw
-- constraint violation. Same DROP+ADD shape as 558 / 562 / 574 / 613, and the list
-- below is migration 613's list verbatim plus the two new values -- dropping any
-- existing value would silently break that event kind instead.
--
-- Names avoid the existing `contact_captured` (a visitor leaving their details on
-- a public form, rendered as "contact captured"). `contact_added` is a member
-- adding a person to the customer record, which is a different fact.
--
-- `account_activities` needs nothing: it has no CHECK on activity_type
-- (migration 565), so the converted-customer path already accepts both values.
--
-- ADD ... NOT VALID + a separate VALIDATE, exactly as 613: lead_activities is the
-- largest table in the schema (append-only, one row per activity), so the default
-- validating ADD (ACCESS EXCLUSIVE + full scan) would be a minutes-long outage at
-- production scale. NOT VALID still enforces on every new write, and VALIDATE then
-- does the scan under SHARE UPDATE EXCLUSIVE without blocking readers or writers.
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
            'deleted', 'undeleted',
            'contact_added', 'contact_deleted'
        )) NOT VALID;
ALTER TABLE lead_activities VALIDATE CONSTRAINT lead_activities_activity_type_check;
