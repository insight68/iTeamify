-- Link inbound leads to stable accounts. Review state stays on leads until
-- conversion; customer operations move to accounts.

ALTER TABLE leads
    ADD COLUMN account_id UUID,
    ADD COLUMN conversion_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (conversion_status IN (
            'pending', 'linked', 'converted', 'disqualified', 'merged'
        )),
    ADD COLUMN converted_at TIMESTAMPTZ,
    ADD COLUMN converted_by_member_id UUID;

ALTER TABLE lead_opportunity ADD COLUMN account_id UUID;
ALTER TABLE lead_assessment ADD COLUMN account_id UUID;
ALTER TABLE service_quote ADD COLUMN account_id UUID;
ALTER TABLE service_order ADD COLUMN account_id UUID;
ALTER TABLE service_engagement ADD COLUMN account_id UUID;
ALTER TABLE outbound_email ADD COLUMN account_id UUID;
