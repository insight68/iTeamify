-- 52tuan.com Prospector Phase 1: customer-mining closed loop.
-- Four tables backing the prospect_jobs queue (modeled on webhook_delivery's
-- claim/lease/retry shape), the prospect_leads pool, the prospect_job_events
-- timeline, and per-workspace prospect_settings (with secretbox-encrypted
-- LLM / search API configs).
--
-- Repository hard rules (CLAUDE.md / AGENTS.md):
--   * No FOREIGN KEY / REFERENCES / ON DELETE CASCADE — relationships and
--     atomic cleanup live in the application layer.
--   * No indexes in this file. Every index (including unique and indexes on
--     these new tables) is a single-statement CREATE INDEX CONCURRENTLY
--     migration in 235..240, so the runner can apply them outside a
--     transaction block.
--   * Every query in pkg/db/queries/prospector.sql filters by workspace_id
--     first; the application layer enforces membership before any read/write.

CREATE TABLE IF NOT EXISTS prospect_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    -- queued     — INSERTed, not yet claimed by a prospector worker
    -- running    — claimed (lease_token set); prospector is executing the
    --              LangGraph closed loop
    -- succeeded  — prospector called /complete; lead pool is final
    -- failed     — attempt_count reached max_attempts; manual retry needed
    -- cancelled  — operator cancelled (also used for pause)
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    -- Free-form seller inputs gathered from the "New job" dialog.
    company_insight TEXT,
    product_positioning TEXT,
    -- keywords is written by KeywordGenAgent; config carries sufficiency
    -- threshold, max_urls_per_job, language hints, etc.
    keywords JSONB NOT NULL DEFAULT '{}'::jsonb,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    -- Lease fields mirror webhook_delivery: a prospector claims via
    -- FOR UPDATE SKIP LOCKED and sets lease_token + lease_expires_at; on
    -- expiry the row is re-claimable by another worker (stale-steal).
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    -- Convenience denormalization of config.sufficiency_threshold so the
    -- claim query and the UI can read it without unpacking JSONB.
    sufficiency_threshold INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    job_id UUID NOT NULL,
    company_name TEXT,
    domain TEXT,
    country TEXT,
    -- Market-language pre-judgment (R9): derived from TLD + address country
    -- at extraction time, no extra LLM call.
    market_language TEXT
        CHECK (market_language IN ('en', 'es', 'pt')),
    -- Arrays of extracted contact strings; kept as JSONB to evolve shape
    -- (e.g. {"value":"sales@acme.com","source":"/contact"}).
    emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- WhatsApp normalization (R8): recognized formats collapse to
    -- +<country-code><subscriber> and a wa.me deep link.
    whatsapp_normalized TEXT,
    whatsapp_link TEXT,
    linkedin_url TEXT,
    -- 0..100 quality score from the reasoning model; NULL = not yet scored.
    quality_score NUMERIC,
    -- 'new' on insert; reserved for future 'exported' / 'contacted' states
    -- when Phase 2 email send lands.
    status TEXT NOT NULL DEFAULT 'new',
    -- Normalized domain (lowercased, www. stripped). The unique index in
    -- migration 238 backs the dedup invariant (R5): one lead per domain
    -- per workspace.
    dedup_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    job_id UUID NOT NULL,
    -- Event types from pkg/protocol (e.g. 'prospector:job:progress',
    -- 'prospector:lead:created'). Stored verbatim for audit / replay.
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    company_profile TEXT,
    positioning TEXT,
    -- Encrypted with secretbox under ITEAMIFY_PROSPECTOR_SECRET_KEY.
    -- BYTEA stores nonce || ciphertext || tag verbatim; the application
    -- layer Seal/Open at the service boundary (KTD-3).
    llm_reasoning_config BYTEA,
    llm_extraction_config BYTEA,
    search_api_config BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
