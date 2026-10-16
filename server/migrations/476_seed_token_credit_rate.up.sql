INSERT INTO token_credit_rate (
    version,
    credits_micro_per_million_tokens,
    active
) VALUES (
    1,
    1000000000,
    TRUE
)
ON CONFLICT DO NOTHING;
