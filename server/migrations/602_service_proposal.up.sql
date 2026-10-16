-- A sales proposal: what we promise to deliver, before it has a price.
--
-- service_quote already carries a priced document, and its constraints say so
-- (total_minor > 0, expires_at NOT NULL). A proposal is a different object with
-- a different lifecycle: it exists while the scope is still being agreed and it
-- deliberately has no amount. Keeping it in its own table means the two never
-- need a "one of these is empty" convention.
--
-- Terms (delivery/commercial) are NOT stored here on purpose. They move with
-- the price, so they belong to the quote. A proposal that is only a scope
-- container shares no column with service_quote, so there is no dual-write
-- consistency problem between the two.
--
-- Relationships are application-managed soft references. No FOREIGN KEY or
-- cascading action is used. Secondary and unique indexes are created in the
-- following single-statement CONCURRENTLY migrations.

CREATE TABLE service_proposal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    proposal_no TEXT NOT NULL,
    opportunity_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    account_id UUID,
    title TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT '',
    deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
    milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
    assumptions TEXT NOT NULL DEFAULT '',
    exclusions TEXT NOT NULL DEFAULT '',
    owner_member_id UUID,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'won', 'lost', 'archived')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_actor_type TEXT NOT NULL
        CHECK (created_by_actor_type IN ('agent', 'member')),
    created_by_actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(TRIM(BOTH FROM title)) > 0),
    CHECK (length(TRIM(BOTH FROM proposal_no)) > 0),
    CHECK (jsonb_typeof(deliverables) = 'array'),
    CHECK (jsonb_typeof(milestones) = 'array')
);

-- scope carries no length(TRIM(...)) > 0 check: a draft is allowed to have an
-- empty scope, and the strictness belongs to the "send" transition where the
-- operator can be told what is missing.
