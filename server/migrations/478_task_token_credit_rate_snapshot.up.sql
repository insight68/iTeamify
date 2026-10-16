CREATE TABLE task_token_credit_rate_snapshot (
    task_id UUID NOT NULL,
    rate_version BIGINT NOT NULL,
    credits_micro_per_million_tokens BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT task_token_credit_rate_snapshot_version_positive CHECK (rate_version > 0),
    CONSTRAINT task_token_credit_rate_snapshot_value_positive CHECK (credits_micro_per_million_tokens > 0)
);
