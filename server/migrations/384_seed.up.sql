-- Installation defaults only; no historical business data or backfills.
INSERT INTO public.billing_settings (singleton) VALUES (true);

INSERT INTO public.task_usage_hourly_rollup_state (id, watermark_at)
VALUES (1, now() - interval '5 minutes');

INSERT INTO public.token_credit_rate (version, credits_micro_per_million_tokens, active)
VALUES (1, 1000000000, true);
