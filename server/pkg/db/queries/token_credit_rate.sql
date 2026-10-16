-- name: GetActiveTokenCreditRate :one
SELECT id, version, credits_micro_per_million_tokens, active, created_by, created_at
FROM token_credit_rate
WHERE active = TRUE;

-- name: GetOrCreateTaskTokenCreditRateSnapshot :one
INSERT INTO task_token_credit_rate_snapshot (
    task_id,
    rate_version,
    credits_micro_per_million_tokens
)
SELECT $1, version, credits_micro_per_million_tokens
FROM token_credit_rate
WHERE active = TRUE
ON CONFLICT (task_id) DO UPDATE SET task_id = EXCLUDED.task_id
RETURNING task_id, rate_version, credits_micro_per_million_tokens, created_at;
