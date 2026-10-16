ALTER TABLE service_order
    DROP CONSTRAINT service_order_settlement_audit_check,
    DROP COLUMN settlement_note,
    DROP COLUMN settled_by_actor_id,
    DROP COLUMN settled_by_actor_type,
    DROP COLUMN settled_at,
    DROP COLUMN settlement_source;
