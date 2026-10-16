-- Narrow the enum back and drop the audit columns. This FAILS if any deleted
-- rows exist, which is the same trade-off migrations 558 / 562 / 574 make for
-- their activity enumerations: rollback runs against a database whose rows can
-- be un-deleted first, and refusing to roll back is preferable to discarding
-- audit history. Restore the rows with PUT /api/leads/{id}/undelete before
-- rolling this back.
ALTER TABLE leads DROP CONSTRAINT leads_delete_audit_check;

ALTER TABLE leads
    DROP COLUMN deleted_at,
    DROP COLUMN delete_reason,
    DROP COLUMN delete_source,
    DROP COLUMN deleted_by_member_id;

ALTER TABLE leads
    DROP CONSTRAINT leads_record_status_check,
    ADD CONSTRAINT leads_record_status_check
        CHECK (record_status IN ('active', 'archived', 'merged'));
