ALTER TABLE outbound_email DROP COLUMN IF EXISTS account_id;
ALTER TABLE service_engagement DROP COLUMN IF EXISTS account_id;
ALTER TABLE service_order DROP COLUMN IF EXISTS account_id;
ALTER TABLE service_quote DROP COLUMN IF EXISTS account_id;
ALTER TABLE lead_assessment DROP COLUMN IF EXISTS account_id;
ALTER TABLE lead_opportunity DROP COLUMN IF EXISTS account_id;
ALTER TABLE leads
    DROP COLUMN IF EXISTS converted_by_member_id,
    DROP COLUMN IF EXISTS converted_at,
    DROP COLUMN IF EXISTS conversion_status,
    DROP COLUMN IF EXISTS account_id;
