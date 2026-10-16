-- Public Sales Expert persistence. All relationships are application-managed
-- soft references: this schema intentionally has no foreign keys or cascades.
-- Secondary and unique indexes are created by the following single-statement
-- CONCURRENTLY migrations.

CREATE TABLE public_expert_page (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    agent_id UUID,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'paused', 'archived')),
    ai_enabled BOOLEAN NOT NULL DEFAULT true,
    autonomous_quote_enabled BOOLEAN NOT NULL DEFAULT true,
    default_owner_member_id UUID,
    current_release_id UUID,
    draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
    draft_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by_user_id UUID NOT NULL,
    updated_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(draft_config) = 'object'),
    CHECK (
        status IN ('draft', 'archived')
        OR (
            agent_id IS NOT NULL
            AND default_owner_member_id IS NOT NULL
            AND current_release_id IS NOT NULL
        )
    )
);

CREATE TABLE public_expert_page_release (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    business_release_id UUID NOT NULL,
    public_profile_snapshot JSONB NOT NULL,
    public_content_snapshot JSONB NOT NULL,
    public_instructions TEXT NOT NULL DEFAULT '',
    qualification_policy JSONB NOT NULL,
    quote_policy JSONB NOT NULL,
    runtime_policy JSONB NOT NULL,
    consent_copy TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    privacy_policy_version TEXT NOT NULL,
    pricing_risk_ack_version TEXT NOT NULL,
    pricing_risk_ack_by_user_id UUID NOT NULL,
    published_by_user_id UUID NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(public_profile_snapshot) = 'object'),
    CHECK (jsonb_typeof(public_content_snapshot) = 'object'),
    CHECK (jsonb_typeof(qualification_policy) = 'object'),
    CHECK (jsonb_typeof(quote_policy) = 'object'),
    CHECK (jsonb_typeof(runtime_policy) = 'object'),
    CHECK (length(consent_version) BETWEEN 1 AND 100),
    CHECK (length(privacy_policy_version) BETWEEN 1 AND 100),
    CHECK (length(pricing_risk_ack_version) BETWEEN 1 AND 100)
);

CREATE TABLE public_expert_session (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    public_ref TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    page_id UUID NOT NULL,
    release_id UUID NOT NULL,
    capability_hash BYTEA NOT NULL,
    lead_id UUID,
    contact_id UUID,
    qualification_id UUID,
    accountable_owner_member_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'closed', 'expired', 'blocked')),
    mode TEXT NOT NULL DEFAULT 'chat'
        CHECK (mode IN ('chat', 'contact_only')),
    anonymous_turn_reserved_count INTEGER NOT NULL DEFAULT 0
        CHECK (anonymous_turn_reserved_count >= 0),
    anonymous_turn_consumed_count INTEGER NOT NULL DEFAULT 0
        CHECK (anonymous_turn_consumed_count >= 0),
    next_message_sequence BIGINT NOT NULL DEFAULT 1
        CHECK (next_message_sequence > 0),
    next_event_sequence BIGINT NOT NULL DEFAULT 1
        CHECK (next_event_sequence > 0),
    locale TEXT NOT NULL DEFAULT '',
    utm_source TEXT NOT NULL DEFAULT '',
    utm_medium TEXT NOT NULL DEFAULT '',
    utm_campaign TEXT NOT NULL DEFAULT '',
    referrer_origin TEXT NOT NULL DEFAULT '',
    capability_revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(public_ref) BETWEEN 22 AND 128),
    CHECK (octet_length(capability_hash) = 32),
    CHECK (anonymous_turn_consumed_count <= anonymous_turn_reserved_count),
    CHECK (expires_at > created_at)
);

CREATE TABLE public_expert_message (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    session_id UUID NOT NULL,
    task_id UUID,
    sequence BIGINT NOT NULL CHECK (sequence > 0),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    author_type TEXT NOT NULL CHECK (author_type IN ('visitor', 'agent', 'system')),
    content TEXT NOT NULL,
    client_message_id TEXT,
    normalized_payload_hash BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (char_length(content) BETWEEN 1 AND 65536),
    CHECK (
        (role = 'user' AND author_type = 'visitor'
            AND client_message_id IS NOT NULL
            AND normalized_payload_hash IS NOT NULL)
        OR (role = 'assistant' AND author_type = 'agent')
        OR (role = 'system' AND author_type = 'system')
    ),
    CHECK (client_message_id IS NULL OR length(client_message_id) BETWEEN 1 AND 200),
    CHECK (normalized_payload_hash IS NULL OR octet_length(normalized_payload_hash) = 32)
);

CREATE TABLE public_expert_task (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    page_id UUID NOT NULL,
    session_id UUID NOT NULL,
    release_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    source_message_id UUID,
    continuation_of_task_id UUID,
    pending_action_id UUID,
    task_kind TEXT NOT NULL DEFAULT 'conversation'
        CHECK (task_kind IN ('conversation', 'continuation')),
    surface TEXT NOT NULL DEFAULT 'public_expert'
        CHECK (surface = 'public_expert'),
    audience TEXT NOT NULL DEFAULT 'public_sales'
        CHECK (audience = 'public_sales'),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'dispatched', 'running', 'completed', 'failed', 'cancelled')),
    profile_version TEXT NOT NULL,
    input_snapshot JSONB NOT NULL,
    input_hash BYTEA NOT NULL,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    accountable_user_id UUID,
    tool_credential_hash BYTEA,
    tool_credential_expires_at TIMESTAMPTZ,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 20),
    max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens > 0),
    max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0),
    max_cost_minor BIGINT NOT NULL CHECK (max_cost_minor >= 0),
    actual_input_tokens INTEGER CHECK (actual_input_tokens IS NULL OR actual_input_tokens >= 0),
    actual_output_tokens INTEGER CHECK (actual_output_tokens IS NULL OR actual_output_tokens >= 0),
    actual_cost_minor BIGINT CHECK (actual_cost_minor IS NULL OR actual_cost_minor >= 0),
    next_action_ordinal INTEGER NOT NULL DEFAULT 1 CHECK (next_action_ordinal > 0),
    dispatched_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(profile_version) BETWEEN 1 AND 200),
    CHECK (jsonb_typeof(input_snapshot) = 'object'),
    CHECK (jsonb_typeof(result) = 'object'),
    CHECK (octet_length(input_hash) = 32),
    CHECK (tool_credential_hash IS NULL OR octet_length(tool_credential_hash) = 32),
    CHECK (
        (task_kind = 'conversation' AND source_message_id IS NOT NULL)
        OR (task_kind = 'continuation' AND continuation_of_task_id IS NOT NULL
            AND pending_action_id IS NOT NULL)
    )
);

CREATE TABLE public_expert_session_event (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    session_id UUID NOT NULL,
    sequence BIGINT NOT NULL CHECK (sequence > 0),
    event_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(event_key) BETWEEN 1 AND 200),
    CHECK (length(event_type) BETWEEN 1 AND 100),
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE public_expert_contact (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    session_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'superseded', 'withdrawn')),
    full_name TEXT NOT NULL,
    company_name TEXT NOT NULL DEFAULT '',
    email TEXT,
    email_normalized TEXT,
    phone TEXT,
    phone_e164 TEXT,
    request_id TEXT NOT NULL,
    normalized_payload_hash BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (char_length(full_name) BETWEEN 1 AND 200),
    CHECK (email_normalized IS NOT NULL OR phone_e164 IS NOT NULL),
    CHECK (length(request_id) BETWEEN 1 AND 200),
    CHECK (octet_length(normalized_payload_hash) = 32)
);

CREATE TABLE public_expert_consent_record (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    session_id UUID NOT NULL,
    lead_id UUID,
    contact_id UUID,
    purpose TEXT NOT NULL
        CHECK (purpose IN ('ai_processing_notice', 'sales_follow_up')),
    event_type TEXT NOT NULL
        CHECK (event_type IN ('granted', 'withdrawn')),
    copy_version TEXT NOT NULL,
    privacy_policy_version TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT '',
    capture_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    withdrawal_reason TEXT NOT NULL DEFAULT '',
    request_id TEXT NOT NULL,
    normalized_payload_hash BYTEA NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(copy_version) BETWEEN 1 AND 100),
    CHECK (length(privacy_policy_version) BETWEEN 1 AND 100),
    CHECK (length(request_id) BETWEEN 1 AND 200),
    CHECK (octet_length(normalized_payload_hash) = 32),
    CHECK (jsonb_typeof(capture_evidence) = 'object'),
    CHECK (purpose <> 'sales_follow_up' OR (lead_id IS NOT NULL AND contact_id IS NOT NULL)),
    CHECK (event_type <> 'withdrawn' OR char_length(withdrawal_reason) BETWEEN 1 AND 1000)
);

CREATE TABLE public_expert_qualification (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    session_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    release_id UUID NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    supersedes_qualification_id UUID,
    policy_version TEXT NOT NULL,
    facts JSONB NOT NULL,
    facts_hash BYTEA NOT NULL,
    result TEXT NOT NULL
        CHECK (result IN ('qualified', 'disqualified', 'incomplete')),
    matched_disqualifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    request_id TEXT NOT NULL,
    normalized_payload_hash BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(policy_version) BETWEEN 1 AND 100),
    CHECK (length(request_id) BETWEEN 1 AND 200),
    CHECK (jsonb_typeof(facts) = 'object'),
    CHECK (jsonb_typeof(matched_disqualifiers) = 'array'),
    CHECK (octet_length(facts_hash) = 32),
    CHECK (octet_length(normalized_payload_hash) = 32)
);

CREATE TABLE public_expert_pending_action (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    session_id UUID NOT NULL,
    source_task_id UUID NOT NULL,
    source_action_ordinal INTEGER NOT NULL CHECK (source_action_ordinal > 0),
    action_type TEXT NOT NULL
        CHECK (action_type IN ('quote', 'handoff', 'continue_after_contact', 'continue_after_qualification')),
    waiting_for TEXT NOT NULL
        CHECK (waiting_for IN ('contact', 'qualification')),
    payload_snapshot JSONB NOT NULL,
    payload_hash BYTEA NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('awaiting_contact', 'awaiting_qualification', 'queued', 'completed', 'rejected', 'expired', 'cancelled')),
    continuation_task_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CHECK (jsonb_typeof(payload_snapshot) = 'object'),
    CHECK (octet_length(payload_hash) = 32),
    CHECK (expires_at > created_at)
);

CREATE TABLE public_expert_usage_reservation (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    reservation_key TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    page_id UUID NOT NULL,
    session_id UUID NOT NULL,
    task_id UUID NOT NULL,
    client_message_id TEXT NOT NULL,
    payload_hash BYTEA NOT NULL,
    reserved_turns INTEGER NOT NULL DEFAULT 1 CHECK (reserved_turns > 0),
    reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens > 0),
    reserved_cost_minor BIGINT NOT NULL CHECK (reserved_cost_minor >= 0),
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'started', 'settled', 'released')),
    actual_tokens INTEGER CHECK (actual_tokens IS NULL OR actual_tokens >= 0),
    actual_cost_minor BIGINT CHECK (actual_cost_minor IS NULL OR actual_cost_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    CHECK (length(reservation_key) BETWEEN 1 AND 200),
    CHECK (length(client_message_id) BETWEEN 1 AND 200),
    CHECK (octet_length(payload_hash) = 32)
);

CREATE TABLE task_dispatch_outbox (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    event_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'dispatched', 'dead_letter')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at TIMESTAMPTZ,
    CHECK (length(event_key) BETWEEN 1 AND 200)
);

CREATE TABLE delivery_outbox (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
    event_type TEXT NOT NULL,
    recipient_type TEXT NOT NULL
        CHECK (recipient_type IN ('member', 'webhook')),
    recipient_id UUID NOT NULL,
    event_key TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'delivered', 'dead_letter')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    CHECK (length(aggregate_type) BETWEEN 1 AND 100),
    CHECK (length(event_type) BETWEEN 1 AND 100),
    CHECK (length(event_key) BETWEEN 1 AND 200),
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE public_quote_contact_verification (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    public_ref TEXT NOT NULL,
    workspace_id UUID NOT NULL,
    page_id UUID NOT NULL,
    session_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    quote_id UUID NOT NULL,
    quote_revision INTEGER NOT NULL CHECK (quote_revision > 0),
    contact_id UUID NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
    contact_value_hash BYTEA NOT NULL,
    challenge_hash BYTEA NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_delivery'
        CHECK (status IN ('pending_delivery', 'sent', 'verified', 'used', 'expired', 'locked', 'delivery_failed')),
    provider TEXT NOT NULL DEFAULT '',
    provider_message_id TEXT NOT NULL DEFAULT '',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
    request_id TEXT NOT NULL,
    normalized_payload_hash BYTEA NOT NULL,
    sent_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(public_ref) BETWEEN 22 AND 128),
    CHECK (length(request_id) BETWEEN 1 AND 200),
    CHECK (octet_length(contact_value_hash) = 32),
    CHECK (octet_length(challenge_hash) >= 32),
    CHECK (octet_length(normalized_payload_hash) = 32),
    CHECK (expires_at > created_at)
);

CREATE TABLE public_quote_acceptance_evidence (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    page_id UUID NOT NULL,
    session_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    quote_id UUID NOT NULL,
    order_id UUID NOT NULL,
    quote_revision INTEGER NOT NULL CHECK (quote_revision > 0),
    contact_id UUID NOT NULL,
    verification_challenge_id UUID,
    assurance_level TEXT NOT NULL
        CHECK (assurance_level = 'contact_otp'),
    quote_snapshot_hash BYTEA NOT NULL,
    terms_version TEXT NOT NULL,
    disclosure_version TEXT NOT NULL,
    terms_accepted BOOLEAN NOT NULL,
    request_id TEXT NOT NULL,
    normalized_payload_hash BYTEA NOT NULL,
    request_audit JSONB NOT NULL DEFAULT '{}'::jsonb,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (terms_accepted),
    CHECK (length(terms_version) BETWEEN 1 AND 100),
    CHECK (length(disclosure_version) BETWEEN 1 AND 100),
    CHECK (length(request_id) BETWEEN 1 AND 200),
    CHECK (octet_length(quote_snapshot_hash) = 32),
    CHECK (octet_length(normalized_payload_hash) = 32),
    CHECK (jsonb_typeof(request_audit) = 'object'),
    CHECK (verification_challenge_id IS NOT NULL)
);
