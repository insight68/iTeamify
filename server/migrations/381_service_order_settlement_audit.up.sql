ALTER TABLE service_order
    ADD COLUMN settlement_source TEXT
        CHECK (settlement_source IS NULL OR settlement_source IN ('manual', 'verified', 'imported')),
    ADD COLUMN settled_at TIMESTAMPTZ,
    ADD COLUMN settled_by_actor_type TEXT
        CHECK (settled_by_actor_type IS NULL OR settled_by_actor_type IN ('member', 'agent', 'system')),
    ADD COLUMN settled_by_actor_id UUID,
    ADD COLUMN settlement_note TEXT;

UPDATE service_order
SET settlement_source = 'imported',
    settled_at = COALESCE(updated_at, confirmed_at),
    settled_by_actor_type = 'system',
    settlement_note = 'Backfilled before settlement audit metadata was introduced'
WHERE settlement_status = 'paid';

ALTER TABLE service_order
    ADD CONSTRAINT service_order_settlement_audit_check CHECK (
        (settlement_status <> 'paid')
        OR
        (settlement_source IS NOT NULL AND settled_at IS NOT NULL)
    );
