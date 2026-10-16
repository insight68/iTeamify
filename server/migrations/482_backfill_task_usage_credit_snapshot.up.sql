INSERT INTO task_token_credit_rate_snapshot (
    task_id,
    rate_version,
    credits_micro_per_million_tokens
)
SELECT DISTINCT
    usage.task_id,
    rate.version,
    rate.credits_micro_per_million_tokens
FROM task_usage usage
CROSS JOIN token_credit_rate rate
WHERE rate.active = TRUE
ON CONFLICT (task_id) DO NOTHING;

UPDATE task_usage usage
SET credit_micro = (
        CEIL(
            (
                usage.input_tokens
                + usage.output_tokens
                + usage.cache_read_tokens
                + usage.cache_write_tokens
            )::numeric
            * snapshot.credits_micro_per_million_tokens::numeric
            / 1000000000::numeric
        ) * 1000
    )::bigint,
    token_credit_rate_version = snapshot.rate_version,
    credits_micro_per_million_tokens = snapshot.credits_micro_per_million_tokens
FROM task_token_credit_rate_snapshot snapshot
WHERE snapshot.task_id = usage.task_id
  AND usage.token_credit_rate_version IS NULL;
