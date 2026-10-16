CREATE TABLE customer_pool_company (
 id UUID NOT NULL DEFAULT gen_random_uuid(), identity_key TEXT NOT NULL,
 name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 300), domain TEXT NOT NULL DEFAULT '',
 country TEXT NOT NULL DEFAULT '', industry TEXT NOT NULL DEFAULT '', headcount INTEGER NOT NULL DEFAULT 0 CHECK(headcount >= 0),
 summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','disabled')),
 version INTEGER NOT NULL DEFAULT 1, observed_at TIMESTAMPTZ NOT NULL,
 field_sources JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_contact (
 id UUID NOT NULL DEFAULT gen_random_uuid(), company_id UUID NOT NULL, identity_key TEXT NOT NULL,
 full_name TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', seniority TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
 linkedin_url TEXT NOT NULL DEFAULT '', work_email TEXT NOT NULL DEFAULT '',
 email_status TEXT NOT NULL DEFAULT 'unknown' CHECK(email_status IN ('unknown','verified','invalid','catch_all')),
 email_verified_at TIMESTAMPTZ, observed_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','disabled')),
 version INTEGER NOT NULL DEFAULT 1, field_sources JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_source (
 id UUID NOT NULL DEFAULT gen_random_uuid(), kind TEXT NOT NULL CHECK(kind IN ('own_search','apollo','import')),
 name TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false, account_key TEXT NOT NULL,
 secret_ciphertext TEXT NOT NULL DEFAULT '', secret_hint TEXT NOT NULL DEFAULT '', ingest_token_hash TEXT NOT NULL DEFAULT '',
 config JSONB NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
 daily_limit NUMERIC NOT NULL DEFAULT 0 CHECK(daily_limit >= 0), call_limit NUMERIC NOT NULL DEFAULT 0 CHECK(call_limit >= 0),
 usage_snapshot JSONB NOT NULL DEFAULT '{}', tested_at TIMESTAMPTZ, last_error TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_source_record (
 id UUID NOT NULL DEFAULT gen_random_uuid(), source_id UUID NOT NULL, external_key TEXT NOT NULL,
 content_hash TEXT NOT NULL, batch_id TEXT NOT NULL, company_id UUID NOT NULL,
 source_url TEXT NOT NULL DEFAULT '', observed_at TIMESTAMPTZ NOT NULL,
 facts JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_request (
 id UUID NOT NULL DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL, requester_id UUID NOT NULL,
 request_key TEXT NOT NULL, criteria JSONB NOT NULL,
 unit_price_micro BIGINT NOT NULL DEFAULT 0 CHECK(unit_price_micro >= 0), price_version INTEGER NOT NULL DEFAULT 1,
 max_charge_micro BIGINT NOT NULL DEFAULT 0 CHECK(max_charge_micro >= 0), charged_micro BIGINT NOT NULL DEFAULT 0 CHECK(charged_micro >= 0 AND charged_micro <= max_charge_micro),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','awaiting_review','succeeded','partial','failed','canceled')),
 stage TEXT NOT NULL DEFAULT 'matching', version INTEGER NOT NULL DEFAULT 1,
 approved_plan JSONB NOT NULL DEFAULT '{}', checkpoint JSONB NOT NULL DEFAULT '{}',
 qualified_count INTEGER NOT NULL DEFAULT 0, stop_reason TEXT NOT NULL DEFAULT '',
 lease_token UUID, lease_expires_at TIMESTAMPTZ, attempt_count INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_request_item (
 id UUID NOT NULL DEFAULT gen_random_uuid(), request_id UUID NOT NULL, company_id UUID NOT NULL,
 contact_id UUID, object_key TEXT NOT NULL, company_version INTEGER NOT NULL, contact_version INTEGER NOT NULL DEFAULT 0,
 match_reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_provider_call (
 id UUID NOT NULL DEFAULT gen_random_uuid(), source_id UUID NOT NULL, account_key TEXT NOT NULL, request_id UUID NOT NULL,
 batch_key TEXT NOT NULL, action TEXT NOT NULL, request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('prepared','in_flight','succeeded','failed','unknown')),
 max_cost NUMERIC NOT NULL CHECK(max_cost >= 0), actual_cost NUMERIC CHECK(actual_cost >= 0), provider_request_id TEXT NOT NULL DEFAULT '',
 response JSONB NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_pool_event (
 id UUID NOT NULL DEFAULT gen_random_uuid(), actor_id UUID, workspace_id UUID,
 action TEXT NOT NULL, object_id UUID NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lead_sources ADD COLUMN lead_contact_id UUID, ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE lead_sources DROP CONSTRAINT lead_sources_source_type_check;
ALTER TABLE lead_sources ADD CONSTRAINT lead_sources_source_type_check CHECK(source_type IN ('lead_mining','chat','manual','quote','import','api','public_expert','daily_opportunity','customer_pool'));
ALTER TABLE billing_settings ADD COLUMN customer_pool_price_micro BIGINT NOT NULL DEFAULT 0 CHECK(customer_pool_price_micro BETWEEN 0 AND 1000000000000), ADD COLUMN customer_pool_price_version INTEGER NOT NULL DEFAULT 1;
