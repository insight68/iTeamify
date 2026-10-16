-- Leads need a third disposition beyond approve/reject and won/lost.
--
-- `rejected` and `lost` are verdicts: "we judged this out" and "the deal
-- collapsed". Neither describes the case that actually floods the working
-- queues today -- a lead that is simply not worth pursuing *right now*, at a
-- score too low and an opportunity too cold to justify attention. Forcing those
-- into a verdict either misfiles them (a lead that never negotiated was never
-- "lost") or leaves them in the review/follow-up/stalled queues forever.
--
-- Parking is a reversible shelving state: it takes a lead out of every working
-- queue while keeping the reason it left, so the decision stays explainable.
--
-- Parking is orthogonal to review_status on purpose. It does not rewrite the
-- review verdict, so restoring a lead puts it back exactly where it was instead
-- of guessing which lane it came from.
--
-- Mirrors the audit-tuple style of leads_score_override_audit_check: either
-- every park column is NULL, or the whole tuple is present and coherent. That
-- keeps "half parked" unrepresentable at the storage layer rather than relying
-- on every caller to write a consistent set.
--
-- The `IS NOT NULL` guards on park_reason and park_source are load-bearing, not
-- redundant with the predicates that follow. Without them a row that sets only
-- parked_at makes `length(TRIM(NULL)) > 0` evaluate to NULL, and `FALSE OR NULL`
-- is NULL -- which a CHECK constraint accepts. The constraint would then admit
-- exactly the half-parked row it exists to forbid, silently. Every predicate
-- below is therefore forced to a definite boolean before it is combined.
ALTER TABLE leads
    ADD COLUMN parked_at TIMESTAMPTZ,
    ADD COLUMN park_reason TEXT,
    ADD COLUMN park_source TEXT,
    ADD COLUMN parked_by_member_id UUID;

ALTER TABLE leads
    ADD CONSTRAINT leads_park_audit_check CHECK (
        (
            parked_at IS NULL
            AND park_reason IS NULL
            AND park_source IS NULL
            AND parked_by_member_id IS NULL
        )
        OR (
            parked_at IS NOT NULL
            AND park_reason IS NOT NULL
            AND length(TRIM(BOTH FROM park_reason)) > 0
            AND park_source IS NOT NULL
            AND park_source IN ('manual', 'system')
            -- A manual park names the member who shelved it; the automatic
            -- sweeper parks on its own behalf and has no member to attribute.
            AND ((park_source = 'manual') = (parked_by_member_id IS NOT NULL))
        )
    );
