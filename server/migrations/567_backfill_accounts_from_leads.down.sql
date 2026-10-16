-- Backfill is not reversible without dropping migrated account rows.
-- Down migration 565 removes account tables; reset lead links first.

UPDATE outbound_email SET account_id = NULL WHERE account_id IS NOT NULL;
UPDATE service_engagement SET account_id = NULL WHERE account_id IS NOT NULL;
UPDATE service_order SET account_id = NULL WHERE account_id IS NOT NULL;
UPDATE service_quote SET account_id = NULL WHERE account_id IS NOT NULL;
UPDATE lead_assessment SET account_id = NULL WHERE account_id IS NOT NULL;
UPDATE lead_opportunity SET account_id = NULL WHERE account_id IS NOT NULL;

UPDATE leads
SET account_id = NULL,
    conversion_status = 'pending',
    converted_at = NULL,
    converted_by_member_id = NULL
WHERE account_id IS NOT NULL;
