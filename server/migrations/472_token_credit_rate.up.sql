CREATE TABLE token_credit_rate (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    version BIGINT NOT NULL,
    credits_micro_per_million_tokens BIGINT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT token_credit_rate_version_positive CHECK (version > 0),
    CONSTRAINT token_credit_rate_value_positive CHECK (credits_micro_per_million_tokens > 0)
);

COMMENT ON TABLE token_credit_rate IS
    'Versioned deployment-wide user billing rate. Every input, output, cache-read, and cache-write token uses this one rate.';

COMMENT ON COLUMN token_credit_rate.credits_micro_per_million_tokens IS
    'Microcredits charged per 1,000,000 tokens. 1 credit = 1,000,000 microcredits.';
