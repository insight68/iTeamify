-- Per-workspace configuration for CRM automation. Exactly one row per
-- workspace; the unique index that guarantees it lives in 564, matching the
-- prospect_settings pattern (indexes are always their own single-statement
-- concurrent migration so the runner can apply them outside a transaction).
--
-- The only knob that acts on leads today is auto-parking: shelving the leads a
-- workspace has stopped working on so the working lanes stop carrying dead
-- weight. It ships OFF, and an absent row also means OFF, so no backfill is
-- needed for existing workspaces.
--
-- Repository rules applied here: no FOREIGN KEY / REFERENCES / ON DELETE
-- CASCADE (relationships and cleanup live in the application layer), and no
-- indexes in this file.
CREATE TABLE IF NOT EXISTS workspace_crm_automation_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- Off unless explicitly enabled. A scheduled job that moves records out of
    -- the working set is not something anyone should discover after the fact,
    -- so the workspace opts in and can dry-run the exact set first.
    auto_park_enabled BOOLEAN NOT NULL DEFAULT false,
    -- A lead is shelved only when its effective score is at or below this.
    -- The boundary is inclusive: 40 means "40 and under".
    auto_park_score_max NUMERIC NOT NULL DEFAULT 40,
    -- ...and only when nothing has touched it for this many days. Score alone
    -- is not staleness -- a 30-point lead contacted this morning is a live
    -- conversation, not a shelved one.
    auto_park_stale_days INTEGER NOT NULL DEFAULT 30,
    -- Last member who changed this row. Nullable on purpose: rows created by a
    -- migration or a seed have no author, and the scheduled job never writes
    -- here (it only reads).
    updated_by_member_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Every predicate is written so it evaluates to a definite boolean.
    -- `x >= 0` is NULL when x is NULL, and a CHECK that evaluates to NULL
    -- PASSES -- so the NOT NULL guard has to be spelled out rather than
    -- inherited from the column's own NOT NULL. (The same latent hole exists
    -- in leads_score_override_audit_check; deliberately left alone here to keep
    -- this migration scoped to its own table.)
    CONSTRAINT workspace_crm_automation_score_max_check
        CHECK (
            auto_park_score_max IS NOT NULL
            AND auto_park_score_max >= 0
            AND auto_park_score_max <= 100
        ),
    CONSTRAINT workspace_crm_automation_stale_days_check
        CHECK (
            auto_park_stale_days IS NOT NULL
            AND auto_park_stale_days >= 1
            AND auto_park_stale_days <= 365
        )
);
