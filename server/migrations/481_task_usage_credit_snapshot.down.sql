ALTER TABLE task_usage
    DROP COLUMN IF EXISTS credits_micro_per_million_tokens,
    DROP COLUMN IF EXISTS token_credit_rate_version,
    DROP COLUMN IF EXISTS credit_micro;
