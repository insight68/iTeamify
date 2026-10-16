ALTER TABLE task_usage
    ADD COLUMN credit_micro BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN token_credit_rate_version BIGINT,
    ADD COLUMN credits_micro_per_million_tokens BIGINT;

COMMENT ON COLUMN task_usage.credit_micro IS
    'User-facing credits in microcredits, calculated from all four token counters with the task rate snapshot.';
