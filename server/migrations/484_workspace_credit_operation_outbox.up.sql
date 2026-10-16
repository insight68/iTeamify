CREATE TABLE workspace_credit_operation_outbox (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    operation_key TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    cumulative_credit_micro BIGINT NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(operation_key) BETWEEN 1 AND 500),
    CHECK (operation_type IN ('trial_grant', 'usage_settlement')),
    CHECK (cumulative_credit_micro >= 0),
    CHECK (status IN ('pending', 'processing', 'settled', 'dead_letter')),
    CHECK (attempt_count >= 0)
);

COMMENT ON TABLE workspace_credit_operation_outbox IS
    'Durable, coalescing handoff from Aurocreator usage/workspace facts to the authoritative iteamify-cloud workspace wallet.';
