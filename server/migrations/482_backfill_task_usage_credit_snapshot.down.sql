UPDATE task_usage
SET credit_micro = 0,
    token_credit_rate_version = NULL,
    credits_micro_per_million_tokens = NULL;

DELETE FROM task_token_credit_rate_snapshot;
