CREATE TABLE workspace_credit_account (
 workspace_id UUID NOT NULL, balance_micro BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workspace_credit_ledger (
 id UUID NOT NULL DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
 business_key TEXT NOT NULL CHECK (length(business_key) BETWEEN 1 AND 500),
 kind TEXT NOT NULL CHECK (kind IN ('trial','topup','usage','adjustment')),
 amount_micro BIGINT NOT NULL CHECK (amount_micro <> 0), balance_after BIGINT NOT NULL,
 reference_id TEXT NOT NULL DEFAULT '', actor_id UUID, description TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workspace_topup_order (
 id UUID NOT NULL DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL, payer_user_id UUID NOT NULL,
 request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128),
 amount_cents BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 99999999),
 credits_micro BIGINT NOT NULL CHECK (credits_micro > 0),
 credits_micro_per_usd BIGINT NOT NULL CHECK (credits_micro_per_usd > 0),
 return_url TEXT NOT NULL,
 stripe_checkout_id TEXT NOT NULL DEFAULT '', checkout_url TEXT NOT NULL DEFAULT '',
 stripe_payment_id TEXT NOT NULL DEFAULT '', stripe_event_id TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','canceled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE billing_settings (
 singleton BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton),
 credits_micro_per_usd BIGINT NOT NULL DEFAULT 0 CHECK (credits_micro_per_usd >= 0),
 topup_amounts_cents BIGINT[] NOT NULL DEFAULT '{}',
 negative_limit_micro BIGINT NOT NULL DEFAULT 0 CHECK (negative_limit_micro <= 0),
 updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO billing_settings (singleton) VALUES (TRUE);
INSERT INTO workspace_credit_account (workspace_id) SELECT id FROM workspace;
ALTER TABLE agent_task_queue ADD COLUMN local_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE task_usage ADD COLUMN settled_credit_micro BIGINT NOT NULL DEFAULT 0 CHECK (settled_credit_micro >= 0);
COMMENT ON COLUMN agent_task_queue.local_billing_enabled IS 'Set transactionally only when a task starts under local billing. Historical/running tasks are not retroactively charged.';
