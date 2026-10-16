-- Soft delete: the fourth disposition on an acquisition record, for rows that
-- should never have entered the workspace at all (bad imports, test data,
-- obvious junk). Rejection and parking both carry a judgement about the
-- *contact* -- "does not fit the target profile" / "not worth pursuing yet" --
-- and neither is honest about a row that was never a real lead. Delete is that
-- case, and it is reversible; this is not the permanent purge.
--
-- The state lives in record_status rather than a standalone deleted_at column
-- on purpose. `record_status = 'active'` is the predicate every business-facing
-- read already gates on, so widening this enum fails closed: a read path that
-- forgets to handle deletion drops the row instead of leaking it. A new
-- deleted_at column would fail open -- every forgotten predicate exposes junk.
--
-- `archived` and `merged` have had no writer on leads since migration 252
-- defined them, so widening this enum collides with nothing. (accounts has its
-- own CHECK and intentionally stays at active/archived/merged: v1 refuses to
-- delete a converted customer.)
--
-- NOT VALID + VALIDATE in two steps: validating a CHECK takes ACCESS EXCLUSIVE
-- and rewrites nothing but does scan the whole table, and `leads` is on the hot
-- write path (every prospect import, every chat upsert). The add is
-- metadata-only, and NOT VALID still rejects bad values on every new
-- INSERT/UPDATE -- it only skips the historical scan, which VALIDATE then does
-- under SHARE UPDATE EXCLUSIVE without blocking readers or writers.
-- Same shape as migration 191 (issue_properties).
ALTER TABLE leads
    DROP CONSTRAINT leads_record_status_check,
    ADD CONSTRAINT leads_record_status_check
        CHECK (record_status IN ('active', 'archived', 'merged', 'deleted'))
        NOT VALID;
ALTER TABLE leads VALIDATE CONSTRAINT leads_record_status_check;

-- All four columns are nullable with no default, so this is a metadata-only
-- change (no table rewrite) on any supported Postgres.
ALTER TABLE leads
    ADD COLUMN deleted_at TIMESTAMPTZ,
    ADD COLUMN delete_reason TEXT,
    ADD COLUMN delete_source TEXT,
    ADD COLUMN deleted_by_member_id UUID;

-- Audit tuple mirrors leads_park_audit_check (migration 560), including its
-- hard-won lesson: a CHECK accepts anything that is not FALSE, so
-- `length(TRIM(NULL)) > 0` evaluates to NULL and `false OR NULL` is still NULL.
-- An unguarded `record_status <> 'deleted'` branch would therefore silently
-- accept a half-written delete (status flipped but no reason recorded). Every
-- predicate below is forced to a definite boolean first; the IS NOT NULL guards
-- are load-bearing, not redundant with the predicates that follow them.
--
-- delete_source separates a deliberate single-row delete from a batch cleanup,
-- which is the answer to "why did this row disappear" months later.
ALTER TABLE leads
    ADD CONSTRAINT leads_delete_audit_check CHECK (
        (
            record_status <> 'deleted'
            AND deleted_at IS NULL
            AND delete_reason IS NULL
            AND delete_source IS NULL
            AND deleted_by_member_id IS NULL
        )
        OR (
            record_status = 'deleted'
            AND deleted_at IS NOT NULL
            AND delete_reason IS NOT NULL
            AND length(TRIM(BOTH FROM delete_reason)) > 0
            AND delete_source IS NOT NULL
            AND delete_source IN ('manual', 'bulk')
            AND deleted_by_member_id IS NOT NULL
        )
    ) NOT VALID;
ALTER TABLE leads VALIDATE CONSTRAINT leads_delete_audit_check;

-- The unique keys that make "delete, then re-import" reuse the same row instead
-- of creating a duplicate are deliberately left unconditional:
--   idx_lead_identities_workspace_type_value (255)
--   idx_lead_sources_workspace_type_key      (256)
--   idx_leads_workspace_dedup                (238, renamed in 251)
-- Releasing a key would mean rebuilding all three as partial indexes, and it
-- would reintroduce the very thing delete exists to clean up -- the same object
-- filed twice. Delete therefore holds the key: a later import that matches a
-- deleted row is skipped rather than silently resurrecting it. Releasing keys
-- belongs to the permanent purge, where a rebuild is justified anyway.
