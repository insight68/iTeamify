CREATE TABLE public_expert_billing (
 task_id UUID NOT NULL,
 workspace_id UUID NOT NULL,
 rate_version BIGINT NOT NULL,
 credits_micro_per_million_tokens BIGINT NOT NULL CHECK (credits_micro_per_million_tokens > 0),
 input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
 output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
 settled_credit_micro BIGINT NOT NULL DEFAULT 0 CHECK (settled_credit_micro >= 0),
 attempt INTEGER NOT NULL CHECK (attempt > 0),
 lease_owner TEXT NOT NULL,
 max_input_tokens BIGINT NOT NULL CHECK (max_input_tokens > 0),
 max_output_tokens BIGINT NOT NULL CHECK (max_output_tokens > 0),
 attempt_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (attempt_input_tokens >= 0),
 attempt_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (attempt_output_tokens >= 0),
 usage_sequence INTEGER NOT NULL DEFAULT 0 CHECK (usage_sequence >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public_expert_billing IS 'Sales task rate snapshot and confirmed cumulative usage. No reservations; historical running tasks without this row are not charged.';
