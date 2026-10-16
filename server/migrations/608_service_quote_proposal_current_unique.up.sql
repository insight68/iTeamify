-- A proposal has exactly one live quote at a time.
--
-- This is the constraint that makes "one proposal = one quote, only the version
-- differs" a database invariant instead of an application convention. The
-- guard rows are the ones that still represent the proposal to the outside
-- world: the unpriced draft, the issued quote, and the accepted one.
-- superseded / revoked / expired are historical, so any number of them may
-- coexist for the same proposal.
--
-- It also fixes the order of a revision: the outgoing quote must be moved to
-- 'superseded' before the new draft is inserted, in one transaction. Inserting
-- first would collide here.
CREATE UNIQUE INDEX CONCURRENTLY uq_service_quote_proposal_current
    ON service_quote (proposal_id)
    WHERE proposal_id IS NOT NULL
      AND status IN ('draft', 'active', 'accepted');
