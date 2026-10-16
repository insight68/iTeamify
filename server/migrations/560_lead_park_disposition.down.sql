ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_park_audit_check;

ALTER TABLE leads
    DROP COLUMN IF EXISTS parked_at,
    DROP COLUMN IF EXISTS park_reason,
    DROP COLUMN IF EXISTS park_source,
    DROP COLUMN IF EXISTS parked_by_member_id;
