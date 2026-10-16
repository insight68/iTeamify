-- Current iTeamify schema. Historical create/alter/drop steps are squashed.
-- Relationships and dependent cleanup are enforced by the application.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    issue_id uuid,
    actor_type text,
    actor_id uuid,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_log_actor_type_check CHECK ((actor_type = ANY (ARRAY['member'::text, 'agent'::text, 'system'::text])))
);

CREATE TABLE public.agent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    avatar_url text,
    runtime_mode text NOT NULL,
    runtime_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    status text DEFAULT 'offline'::text NOT NULL,
    max_concurrent_tasks integer DEFAULT 6 NOT NULL,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    runtime_id uuid NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    custom_env jsonb DEFAULT '{}'::jsonb NOT NULL,
    custom_args jsonb DEFAULT '[]'::jsonb NOT NULL,
    mcp_config jsonb,
    model text,
    thinking_level text,
    composio_toolkit_allowlist text[],
    permission_mode text DEFAULT 'private'::text NOT NULL,
    kind text DEFAULT 'user'::text NOT NULL,
    system_key text,
    disabled_runtime_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
    service_tier text,
    execution_policy_key text DEFAULT 'general'::text NOT NULL,
    CONSTRAINT agent_description_length CHECK ((char_length(description) <= 255)),
    CONSTRAINT agent_execution_policy_key_check CHECK ((execution_policy_key = ANY (ARRAY['general'::text, 'workspace_openagent_v1'::text]))),
    CONSTRAINT agent_kind_check CHECK ((kind = ANY (ARRAY['user'::text, 'system'::text]))),
    CONSTRAINT agent_permission_mode_check CHECK ((permission_mode = ANY (ARRAY['private'::text, 'public_to'::text]))),
    CONSTRAINT agent_runtime_mode_check CHECK ((runtime_mode = ANY (ARRAY['local'::text, 'cloud'::text]))),
    CONSTRAINT agent_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'working'::text, 'blocked'::text, 'error'::text, 'offline'::text]))),
    CONSTRAINT agent_visibility_check CHECK ((visibility = ANY (ARRAY['workspace'::text, 'private'::text])))
);

CREATE TABLE public.agent_invocation_target (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_invocation_target_target_type_check CHECK ((target_type = ANY (ARRAY['workspace'::text, 'member'::text, 'team'::text])))
);

CREATE TABLE public.agent_runtime (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    daemon_id text,
    name text NOT NULL,
    runtime_mode text NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'offline'::text NOT NULL,
    device_info text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid,
    legacy_daemon_id text,
    visibility text DEFAULT 'private'::text NOT NULL,
    profile_id uuid,
    custom_name text,
    CONSTRAINT agent_runtime_runtime_mode_check CHECK ((runtime_mode = ANY (ARRAY['local'::text, 'cloud'::text]))),
    CONSTRAINT agent_runtime_status_check CHECK ((status = ANY (ARRAY['online'::text, 'offline'::text]))),
    CONSTRAINT agent_runtime_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'public'::text])))
);

CREATE TABLE public.agent_skill (
    agent_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE public.agent_task_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    issue_id uuid,
    status text DEFAULT 'queued'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    dispatched_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    result jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    context jsonb,
    runtime_id uuid NOT NULL,
    session_id text,
    work_dir text,
    trigger_comment_id uuid,
    chat_session_id uuid,
    autopilot_run_id uuid,
    attempt integer DEFAULT 1 NOT NULL,
    max_attempts integer DEFAULT 2 NOT NULL,
    parent_task_id uuid,
    failure_reason text,
    trigger_summary text,
    force_fresh_session boolean DEFAULT false NOT NULL,
    is_leader_task boolean DEFAULT false NOT NULL,
    wait_reason text,
    initiator_user_id uuid,
    handoff_note text,
    prepare_lease_expires_at timestamp with time zone,
    squad_id uuid,
    runtime_mcp_overlay jsonb,
    escalation_for_task_id uuid,
    fire_at timestamp with time zone,
    originator_user_id uuid,
    runtime_connected_apps jsonb,
    coalesced_comment_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    delivered_comment_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    chat_input_task_id uuid,
    chat_finalize_deferred_at timestamp with time zone,
    originator_source text,
    delegated_from_task_id uuid,
    retry_of_task_id uuid,
    rerun_of_task_id uuid,
    rule_version_id uuid,
    trigger_evidence_kind text,
    trigger_evidence_ref_id uuid,
    accountable_user_id uuid,
    session_rollout_missing boolean DEFAULT false NOT NULL,
    company_release_id uuid,
    company_release_version integer,
    company_context_pinned_at timestamp with time zone,
    local_billing_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT agent_task_queue_accountable_matches_originator CHECK (((originator_user_id IS NULL) OR ((accountable_user_id IS NOT NULL) AND (accountable_user_id = originator_user_id)))),
    CONSTRAINT agent_task_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'waiting_local_directory'::text, 'deferred'::text])))
);

CREATE TABLE public.agent_to_label (
    agent_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assistant_operation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id text DEFAULT ''::text NOT NULL,
    action text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    risk text NOT NULL,
    confirmation_type text DEFAULT 'none'::text NOT NULL,
    originator_user_id uuid,
    agent_id uuid NOT NULL,
    task_id uuid NOT NULL,
    chat_session_id uuid NOT NULL,
    user_intent_message_id uuid,
    idempotency_key text NOT NULL,
    expected_version integer,
    request jsonb DEFAULT '{}'::jsonb NOT NULL,
    preview jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code text DEFAULT ''::text NOT NULL,
    error_message text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT assistant_operation_confirmation_type_check CHECK ((confirmation_type = ANY (ARRAY['none'::text, 'explicit'::text]))),
    CONSTRAINT assistant_operation_idempotency_key_check CHECK (((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 200))),
    CONSTRAINT assistant_operation_preview_check CHECK ((jsonb_typeof(preview) = 'object'::text)),
    CONSTRAINT assistant_operation_request_check CHECK ((jsonb_typeof(request) = 'object'::text)),
    CONSTRAINT assistant_operation_result_check CHECK ((jsonb_typeof(result) = 'object'::text)),
    CONSTRAINT assistant_operation_risk_check CHECK ((risk = ANY (ARRAY['read'::text, 'low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT assistant_operation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))
);

CREATE TABLE public.attachment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    issue_id uuid,
    comment_id uuid,
    uploader_type text NOT NULL,
    uploader_id uuid NOT NULL,
    filename text NOT NULL,
    url text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    chat_session_id uuid,
    chat_message_id uuid,
    task_id uuid,
    CONSTRAINT attachment_uploader_type_check CHECK ((uploader_type = ANY (ARRAY['member'::text, 'agent'::text])))
);

CREATE TABLE public.auth_challenge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    purpose text NOT NULL,
    code_hash text NOT NULL,
    proof_hash text,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    proof_expires_at timestamp with time zone,
    used_at timestamp with time zone,
    sent_at timestamp with time zone,
    delivery_failed boolean DEFAULT false NOT NULL,
    CONSTRAINT auth_challenge_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT auth_challenge_purpose_check CHECK ((purpose = ANY (ARRAY['login'::text, 'signup'::text, 'reset'::text, 'set_password'::text])))
);

CREATE TABLE public.autopilot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    assignee_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    execution_mode text DEFAULT 'create_issue'::text NOT NULL,
    issue_title_template text,
    created_by_type text NOT NULL,
    created_by_id uuid NOT NULL,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assignee_type text DEFAULT 'agent'::text NOT NULL,
    project_id uuid,
    CONSTRAINT autopilot_assignee_type_check CHECK ((assignee_type = ANY (ARRAY['agent'::text, 'squad'::text]))),
    CONSTRAINT autopilot_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['member'::text, 'agent'::text]))),
    CONSTRAINT autopilot_execution_mode_check CHECK ((execution_mode = ANY (ARRAY['create_issue'::text, 'run_only'::text]))),
    CONSTRAINT autopilot_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])))
);

CREATE TABLE public.autopilot_collaborator (
    autopilot_id uuid NOT NULL,
    user_type text NOT NULL,
    user_id uuid NOT NULL,
    granted_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT autopilot_collaborator_user_type_check CHECK ((user_type = 'member'::text))
);

CREATE TABLE public.autopilot_rule_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    autopilot_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    published_by_type text NOT NULL,
    published_by_id uuid,
    config_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.autopilot_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    autopilot_id uuid NOT NULL,
    trigger_id uuid,
    source text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    issue_id uuid,
    task_id uuid,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    failure_reason text,
    trigger_payload jsonb,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    squad_id uuid,
    planned_at timestamp with time zone,
    webhook_delivery_id uuid,
    CONSTRAINT autopilot_run_source_check CHECK ((source = ANY (ARRAY['schedule'::text, 'manual'::text, 'webhook'::text, 'api'::text]))),
    CONSTRAINT autopilot_run_status_check CHECK ((status = ANY (ARRAY['issue_created'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);

CREATE TABLE public.autopilot_subscriber (
    autopilot_id uuid NOT NULL,
    user_type text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT autopilot_subscriber_user_type_check CHECK ((user_type = 'member'::text))
);

CREATE TABLE public.autopilot_trigger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    autopilot_id uuid NOT NULL,
    kind text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    cron_expression text,
    timezone text DEFAULT 'UTC'::text,
    next_run_at timestamp with time zone,
    webhook_token text,
    label text,
    last_fired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'generic'::text NOT NULL,
    signing_secret text,
    event_filters jsonb,
    published_by_type text,
    published_by_id uuid,
    CONSTRAINT autopilot_trigger_kind_check CHECK ((kind = ANY (ARRAY['schedule'::text, 'webhook'::text, 'api'::text]))),
    CONSTRAINT autopilot_trigger_provider_check CHECK ((provider = ANY (ARRAY['generic'::text, 'github'::text])))
);

CREATE TABLE public.billing_settings (
    singleton boolean DEFAULT true NOT NULL,
    credits_micro_per_usd bigint DEFAULT 0 NOT NULL,
    topup_amounts_cents bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    negative_limit_micro bigint DEFAULT 0 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_settings_credits_micro_per_usd_check CHECK ((credits_micro_per_usd >= 0)),
    CONSTRAINT billing_settings_negative_limit_micro_check CHECK ((negative_limit_micro <= 0)),
    CONSTRAINT billing_settings_singleton_check CHECK (singleton)
);

CREATE TABLE public.business_change_proposal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    chat_session_id uuid,
    source_task_id uuid,
    base_revision integer NOT NULL,
    title text NOT NULL,
    rationale text DEFAULT ''::text NOT NULL,
    operations jsonb NOT NULL,
    source_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by_actor_type text NOT NULL,
    created_by_actor_id uuid,
    applied_revision integer,
    rejected_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_change_proposal_base_revision_check CHECK ((base_revision >= 0)),
    CONSTRAINT business_change_proposal_created_by_actor_type_check CHECK ((created_by_actor_type = ANY (ARRAY['agent'::text, 'member'::text, 'system'::text]))),
    CONSTRAINT business_change_proposal_operations_check CHECK ((jsonb_typeof(operations) = 'array'::text)),
    CONSTRAINT business_change_proposal_source_refs_check CHECK ((jsonb_typeof(source_refs) = 'array'::text)),
    CONSTRAINT business_change_proposal_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'applied'::text, 'partially_applied'::text, 'rejected'::text, 'superseded'::text, 'stale'::text])))
);

CREATE TABLE public.business_context (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    draft_revision integer DEFAULT 0 NOT NULL,
    published_version integer DEFAULT 0 NOT NULL,
    draft_content jsonb DEFAULT '{}'::jsonb NOT NULL,
    published_content jsonb,
    updated_by_user_id uuid,
    published_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT business_context_draft_content_check CHECK ((jsonb_typeof(draft_content) = 'object'::text)),
    CONSTRAINT business_context_draft_revision_check CHECK ((draft_revision >= 0)),
    CONSTRAINT business_context_published_content_check CHECK (((published_content IS NULL) OR (jsonb_typeof(published_content) = 'object'::text))),
    CONSTRAINT business_context_published_version_check CHECK ((published_version >= 0))
);

CREATE TABLE public.business_release (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    version integer NOT NULL,
    draft_revision integer NOT NULL,
    content jsonb NOT NULL,
    change_summary text DEFAULT ''::text NOT NULL,
    published_by_user_id uuid NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_release_content_check CHECK ((jsonb_typeof(content) = 'object'::text)),
    CONSTRAINT business_release_draft_revision_check CHECK ((draft_revision > 0)),
    CONSTRAINT business_release_version_check CHECK ((version > 0))
);

CREATE TABLE public.channel_binding_token (
    token_hash text NOT NULL,
    workspace_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    channel_type text NOT NULL,
    channel_user_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_binding_token_ttl_cap CHECK ((expires_at <= (created_at + '00:15:00'::interval)))
);

CREATE TABLE public.channel_chat_session_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    channel_type text NOT NULL,
    channel_chat_id text NOT NULL,
    chat_type text NOT NULL,
    last_message_id text,
    last_thread_id text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_chat_session_binding_chat_type_check CHECK ((chat_type = ANY (ARRAY['p2p'::text, 'group'::text])))
);

CREATE TABLE public.channel_inbound_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid,
    channel_type text NOT NULL,
    channel_chat_id text,
    event_type text NOT NULL,
    channel_event_id text,
    channel_message_id text,
    drop_reason text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.channel_inbound_message_dedup (
    installation_id uuid NOT NULL,
    message_id text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    claim_token uuid DEFAULT gen_random_uuid() NOT NULL
);

CREATE TABLE public.channel_installation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    channel_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    ws_lease_token text,
    ws_lease_expires_at timestamp with time zone,
    installer_user_id uuid NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_installation_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);

CREATE TABLE public.channel_media_pending_object (
    storage_key text NOT NULL,
    workspace_id uuid NOT NULL,
    chat_message_id uuid NOT NULL,
    storage_url text NOT NULL,
    installation_id uuid,
    state text DEFAULT 'pending'::text NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    attempt integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    tombstone_pass integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_media_pending_object_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'deleting'::text, 'tombstoned'::text])))
);

CREATE TABLE public.channel_outbound_card_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id uuid NOT NULL,
    task_id uuid,
    channel_type text NOT NULL,
    channel_chat_id text NOT NULL,
    channel_card_message_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_patched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_outbound_card_message_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'streaming'::text, 'final'::text, 'error'::text])))
);

CREATE TABLE public.channel_user_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    iteamify_user_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    channel_type text NOT NULL,
    channel_user_id text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.chat_context_resource (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    chat_session_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    resource_version integer,
    label text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'page'::text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_context_resource_resource_id_check CHECK (((length(resource_id) >= 1) AND (length(resource_id) <= 200))),
    CONSTRAINT chat_context_resource_resource_type_check CHECK (((length(resource_type) >= 1) AND (length(resource_type) <= 100))),
    CONSTRAINT chat_context_resource_resource_version_check CHECK (((resource_version IS NULL) OR (resource_version >= 0))),
    CONSTRAINT chat_context_resource_source_check CHECK ((source = ANY (ARRAY['page'::text, 'user'::text, 'system'::text])))
);

CREATE TABLE public.chat_draft_restore (
    id uuid NOT NULL,
    chat_session_id uuid NOT NULL,
    task_id uuid NOT NULL,
    content text NOT NULL,
    attachment_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.chat_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    task_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_reason text,
    elapsed_ms bigint,
    message_kind text DEFAULT 'message'::text NOT NULL,
    channel_media_pending_until timestamp with time zone,
    channel_ingested boolean DEFAULT false NOT NULL,
    sender_id uuid,
    client_message_id uuid,
    sequence bigint,
    CONSTRAINT chat_message_direct_check CHECK ((((sequence IS NULL) AND (((sender_id IS NULL) AND (client_message_id IS NULL)) OR ((sender_id IS NOT NULL) AND (client_message_id IS NOT NULL) AND (role = 'user'::text)))) OR ((sequence > 0) AND (sender_id IS NOT NULL) AND (client_message_id IS NOT NULL) AND (role = 'user'::text) AND (task_id IS NULL) AND (length(btrim(content)) > 0) AND (length(content) <= 20000)))),
    CONSTRAINT chat_message_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

CREATE TABLE public.chat_pinned_agent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.chat_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    agent_id uuid,
    creator_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    session_id text,
    work_dir text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unread_since timestamp with time zone,
    runtime_id uuid,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    is_agent_intro boolean DEFAULT false NOT NULL,
    pinned_at timestamp with time zone,
    project_id uuid,
    kind text DEFAULT 'agent'::text NOT NULL,
    peer_user_id uuid,
    last_sequence bigint DEFAULT 0 NOT NULL,
    creator_read_sequence bigint DEFAULT 0 NOT NULL,
    peer_read_sequence bigint DEFAULT 0 NOT NULL,
    direct_last_message_at timestamp with time zone,
    container_type text DEFAULT 'conversation'::text NOT NULL,
    container_resource_type text,
    container_resource_id uuid,
    last_activity_at timestamp with time zone,
    application_id uuid,
    application_version integer,
    CONSTRAINT chat_session_participants_check CHECK ((((kind = 'agent'::text) AND (agent_id IS NOT NULL) AND (peer_user_id IS NULL)) OR ((kind = 'direct'::text) AND (agent_id IS NULL) AND (peer_user_id IS NOT NULL) AND (peer_user_id <> creator_id) AND (runtime_id IS NULL) AND (project_id IS NULL) AND (session_id IS NULL) AND (work_dir IS NULL) AND (status = 'active'::text) AND (pinned_at IS NULL)))),
    CONSTRAINT chat_session_read_sequences_check CHECK (((last_sequence >= 0) AND ((creator_read_sequence >= 0) AND (creator_read_sequence <= last_sequence)) AND ((peer_read_sequence >= 0) AND (peer_read_sequence <= last_sequence)))),
    CONSTRAINT chat_session_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

CREATE TABLE public.client_usage_daily (
    user_id uuid NOT NULL,
    client_type text NOT NULL,
    install_id uuid NOT NULL,
    activity_date date NOT NULL,
    workspace_id uuid,
    client_version text NOT NULL,
    os text NOT NULL,
    first_active_at timestamp with time zone NOT NULL,
    last_active_at timestamp with time zone NOT NULL,
    runtime_probed_at timestamp with time zone,
    probe_result text,
    runtime_count integer,
    provider_summary jsonb,
    online_count integer,
    offline_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_usage_daily_check CHECK ((first_active_at <= last_active_at)),
    CONSTRAINT client_usage_daily_check1 CHECK ((((runtime_probed_at IS NULL) AND (probe_result IS NULL) AND (runtime_count IS NULL) AND (provider_summary IS NULL) AND (online_count IS NULL) AND (offline_count IS NULL)) OR ((runtime_probed_at IS NOT NULL) AND (probe_result = 'error'::text) AND (runtime_count IS NULL) AND (provider_summary IS NULL) AND (online_count IS NULL) AND (offline_count IS NULL)) OR ((runtime_probed_at IS NOT NULL) AND (probe_result = 'success'::text) AND (runtime_count IS NOT NULL) AND (provider_summary IS NOT NULL) AND (online_count IS NOT NULL) AND (offline_count IS NOT NULL) AND ((online_count + offline_count) = runtime_count) AND (jsonb_typeof(provider_summary) = 'object'::text)))),
    CONSTRAINT client_usage_daily_client_type_check CHECK ((client_type = ANY (ARRAY['web'::text, 'desktop'::text]))),
    CONSTRAINT client_usage_daily_offline_count_check CHECK ((offline_count >= 0)),
    CONSTRAINT client_usage_daily_online_count_check CHECK ((online_count >= 0)),
    CONSTRAINT client_usage_daily_probe_result_check CHECK ((probe_result = ANY (ARRAY['success'::text, 'error'::text]))),
    CONSTRAINT client_usage_daily_runtime_count_check CHECK ((runtime_count >= 0))
);

CREATE TABLE public.comment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    issue_id uuid NOT NULL,
    author_type text NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    type text DEFAULT 'comment'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    workspace_id uuid NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by_type text,
    resolved_by_id uuid,
    source_task_id uuid,
    CONSTRAINT comment_author_type_check CHECK ((author_type = ANY (ARRAY['member'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT comment_resolved_consistency CHECK ((((resolved_at IS NULL) AND (resolved_by_type IS NULL) AND (resolved_by_id IS NULL)) OR ((resolved_at IS NOT NULL) AND (resolved_by_type IS NOT NULL) AND (resolved_by_id IS NOT NULL)))),
    CONSTRAINT comment_type_check CHECK ((type = ANY (ARRAY['comment'::text, 'status_change'::text, 'progress_update'::text, 'system'::text])))
);

CREATE TABLE public.comment_reaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comment_reaction_actor_type_check CHECK ((actor_type = ANY (ARRAY['member'::text, 'agent'::text])))
);

CREATE TABLE public.contact_sales_inquiry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    business_email text NOT NULL,
    company_name text NOT NULL,
    company_size text NOT NULL,
    country_region text NOT NULL,
    use_case text NOT NULL,
    goals text DEFAULT ''::text NOT NULL,
    consent_outreach boolean DEFAULT false NOT NULL,
    consent_updates boolean DEFAULT false NOT NULL,
    submitter_ip inet,
    user_agent text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contract_review (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    fields jsonb NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    result text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    creator_read_version integer DEFAULT 1 NOT NULL,
    peer_read_version integer DEFAULT 0 NOT NULL,
    last_actor_id uuid NOT NULL,
    submission_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    application_id uuid,
    application_version integer,
    application_snapshot jsonb,
    CONSTRAINT contract_review_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'accepted'::text, 'needs_info'::text, 'in_review'::text, 'completed'::text]))),
    CONSTRAINT contract_review_version_check CHECK ((version > 0))
);

CREATE TABLE public.contract_review_action (
    review_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    note text NOT NULL,
    version integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contract_review_file (
    id uuid NOT NULL,
    review_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL,
    object_key text NOT NULL,
    encryption_key bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_review_file_encryption_key_check CHECK ((octet_length(encryption_key) = 32)),
    CONSTRAINT contract_review_file_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 20971520)))
);

CREATE TABLE public.contract_submission (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    review_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    review_version integer NOT NULL,
    task_id uuid NOT NULL,
    input jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.daemon_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    daemon_id text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    last_heartbeat_at timestamp with time zone,
    runtime_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daemon_connection_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text])))
);

CREATE TABLE public.daemon_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    workspace_id uuid NOT NULL,
    daemon_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.github_installation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    installation_id bigint NOT NULL,
    account_login text NOT NULL,
    account_type text DEFAULT 'User'::text NOT NULL,
    account_avatar_url text,
    connected_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT github_installation_account_type_check CHECK ((account_type = ANY (ARRAY['User'::text, 'Organization'::text])))
);

CREATE TABLE public.github_pending_check_suite (
    workspace_id uuid NOT NULL,
    installation_id bigint NOT NULL,
    repo_owner text NOT NULL,
    repo_name text NOT NULL,
    pr_number integer NOT NULL,
    suite_id bigint NOT NULL,
    head_sha text NOT NULL,
    app_id bigint NOT NULL,
    conclusion text,
    status text NOT NULL,
    suite_updated_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.github_pending_installation (
    installation_id bigint NOT NULL,
    account_login text NOT NULL,
    account_type text DEFAULT 'User'::text NOT NULL,
    account_avatar_url text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT github_pending_installation_account_login_check CHECK ((account_login <> ''::text)),
    CONSTRAINT github_pending_installation_account_type_check CHECK ((account_type = ANY (ARRAY['User'::text, 'Organization'::text])))
);

CREATE TABLE public.github_pull_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    installation_id bigint NOT NULL,
    repo_owner text NOT NULL,
    repo_name text NOT NULL,
    pr_number integer NOT NULL,
    title text NOT NULL,
    state text NOT NULL,
    html_url text NOT NULL,
    branch text,
    author_login text,
    author_avatar_url text,
    merged_at timestamp with time zone,
    closed_at timestamp with time zone,
    pr_created_at timestamp with time zone NOT NULL,
    pr_updated_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    head_sha text DEFAULT ''::text NOT NULL,
    mergeable_state text,
    additions integer DEFAULT 0 NOT NULL,
    deletions integer DEFAULT 0 NOT NULL,
    changed_files integer DEFAULT 0 NOT NULL,
    api_mergeable text,
    api_merge_state_status text,
    checks_rollup_state text,
    snapshot_head_sha text DEFAULT ''::text NOT NULL,
    snapshot_fetched_at timestamp with time zone,
    CONSTRAINT github_pull_request_state_check CHECK ((state = ANY (ARRAY['open'::text, 'closed'::text, 'merged'::text, 'draft'::text])))
);

CREATE TABLE public.github_pull_request_check_run (
    pr_id uuid NOT NULL,
    head_sha text NOT NULL,
    ordinal integer NOT NULL,
    name text NOT NULL,
    status text NOT NULL,
    conclusion text,
    details_url text,
    is_status_context boolean DEFAULT false NOT NULL
);

CREATE TABLE public.github_pull_request_check_suite (
    pr_id uuid NOT NULL,
    suite_id bigint NOT NULL,
    head_sha text NOT NULL,
    app_id bigint NOT NULL,
    conclusion text,
    status text NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.gmail_analysis_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    notify_threshold text DEFAULT 'action_required'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gmail_analysis_binding_notify_threshold_check CHECK ((notify_threshold = ANY (ARRAY['action_required'::text, 'attention'::text, 'all'::text])))
);

CREATE TABLE public.gmail_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    gmail_message_id text NOT NULL,
    gmail_thread_id text NOT NULL,
    gmail_history_id text,
    internal_date timestamp with time zone NOT NULL,
    sender text DEFAULT ''::text NOT NULL,
    recipients text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    snippet text DEFAULT ''::text NOT NULL,
    body_text text DEFAULT ''::text NOT NULL,
    label_ids text[] DEFAULT '{}'::text[] NOT NULL,
    size_estimate bigint DEFAULT 0 NOT NULL,
    analysis_status text DEFAULT 'pending'::text NOT NULL,
    analysis_attempt_count integer DEFAULT 0 NOT NULL,
    analysis_available_at timestamp with time zone DEFAULT now() NOT NULL,
    analysis_lease_owner text,
    analysis_lease_expires_at timestamp with time zone,
    analysis_result jsonb,
    analysis_error_code text,
    analyzed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gmail_message_analysis_status_check CHECK ((analysis_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'skipped'::text, 'failed'::text])))
);

CREATE TABLE public.gmail_oauth_state (
    state_hash bytea NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    return_path text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.gmail_sync_job (
    connection_id uuid NOT NULL,
    generation bigint DEFAULT 1 NOT NULL,
    target_history_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    last_error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gmail_sync_job_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'idle'::text])))
);

CREATE TABLE public.inbox_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    recipient_type text NOT NULL,
    recipient_id uuid NOT NULL,
    type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    issue_id uuid,
    title text NOT NULL,
    body text,
    read boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_type text,
    actor_id uuid,
    details jsonb DEFAULT '{}'::jsonb,
    event_key text,
    CONSTRAINT inbox_item_event_key_check CHECK (((event_key IS NULL) OR ((length(event_key) >= 1) AND (length(event_key) <= 200)))),
    CONSTRAINT inbox_item_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['member'::text, 'agent'::text]))),
    CONSTRAINT inbox_item_severity_check CHECK ((severity = ANY (ARRAY['action_required'::text, 'attention'::text, 'info'::text])))
);

CREATE TABLE public.issue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'backlog'::text NOT NULL,
    priority text DEFAULT 'none'::text NOT NULL,
    assignee_type text,
    assignee_id uuid,
    creator_type text NOT NULL,
    creator_id uuid NOT NULL,
    parent_issue_id uuid,
    acceptance_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    context_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    number integer DEFAULT 0 NOT NULL,
    project_id uuid,
    origin_type text,
    origin_id uuid,
    first_executed_at timestamp with time zone,
    start_date date,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    stage integer,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT issue_assignee_type_check CHECK ((assignee_type = ANY (ARRAY['member'::text, 'agent'::text, 'squad'::text]))),
    CONSTRAINT issue_creator_type_check CHECK ((creator_type = ANY (ARRAY['member'::text, 'agent'::text]))),
    CONSTRAINT issue_metadata_is_object CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT issue_metadata_size_limit CHECK ((pg_column_size(metadata) <= 8192)),
    CONSTRAINT issue_origin_type_check CHECK ((origin_type = ANY (ARRAY['autopilot'::text, 'quick_create'::text, 'lark_chat'::text, 'slack_chat'::text, 'agent_create'::text]))),
    CONSTRAINT issue_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'medium'::text, 'low'::text, 'none'::text]))),
    CONSTRAINT issue_properties_is_object CHECK ((jsonb_typeof(properties) = 'object'::text)),
    CONSTRAINT issue_properties_size_limit CHECK ((pg_column_size(properties) <= 16384)),
    CONSTRAINT issue_stage_check CHECK (((stage IS NULL) OR (stage >= 1))),
    CONSTRAINT issue_status_check CHECK ((status = ANY (ARRAY['backlog'::text, 'todo'::text, 'in_progress'::text, 'in_review'::text, 'done'::text, 'blocked'::text, 'cancelled'::text])))
);

CREATE TABLE public.issue_dependency (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    issue_id uuid NOT NULL,
    depends_on_issue_id uuid NOT NULL,
    type text NOT NULL,
    CONSTRAINT issue_dependency_type_check CHECK ((type = ANY (ARRAY['blocks'::text, 'blocked_by'::text, 'related'::text])))
);

CREATE TABLE public.issue_label (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resource_type text DEFAULT 'issue'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    CONSTRAINT issue_label_resource_type_check CHECK ((resource_type = ANY (ARRAY['issue'::text, 'agent'::text, 'skill'::text])))
);

CREATE TABLE public.issue_property (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon text DEFAULT ''::text NOT NULL,
    CONSTRAINT issue_property_config_check CHECK ((jsonb_typeof(config) = 'object'::text)),
    CONSTRAINT issue_property_type_check CHECK ((type = ANY (ARRAY['text'::text, 'number'::text, 'select'::text, 'multi_select'::text, 'date'::text, 'checkbox'::text, 'url'::text])))
);

CREATE TABLE public.issue_pull_request (
    issue_id uuid NOT NULL,
    pull_request_id uuid NOT NULL,
    linked_by_type text,
    linked_by_id uuid,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    close_intent boolean DEFAULT false NOT NULL,
    reference_only boolean DEFAULT false NOT NULL
);

CREATE TABLE public.issue_reaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    issue_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    actor_type text NOT NULL,
    actor_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT issue_reaction_actor_type_check CHECK ((actor_type = ANY (ARRAY['member'::text, 'agent'::text])))
);

CREATE TABLE public.issue_subscriber (
    issue_id uuid NOT NULL,
    user_type text NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT issue_subscriber_reason_check CHECK ((reason = ANY (ARRAY['creator'::text, 'assignee'::text, 'commenter'::text, 'mentioned'::text, 'manual'::text, 'autopilot'::text]))),
    CONSTRAINT issue_subscriber_user_type_check CHECK ((user_type = ANY (ARRAY['member'::text, 'agent'::text])))
);

CREATE TABLE public.issue_to_label (
    issue_id uuid NOT NULL,
    label_id uuid NOT NULL
);

CREATE TABLE public.issue_vcs_pull_request (
    issue_id uuid NOT NULL,
    pull_request_id uuid NOT NULL,
    close_intent boolean DEFAULT false NOT NULL,
    reference_only boolean DEFAULT false NOT NULL,
    linked_by_type text,
    linked_by_id uuid,
    linked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lark_binding_token (
    token_hash text NOT NULL,
    workspace_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    lark_open_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lark_binding_token_ttl_cap CHECK ((expires_at <= (created_at + '00:15:00'::interval)))
);

CREATE TABLE public.lark_chat_session_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    lark_chat_id text NOT NULL,
    lark_chat_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_lark_message_id text,
    last_lark_thread_id text,
    CONSTRAINT lark_chat_session_binding_lark_chat_type_check CHECK ((lark_chat_type = ANY (ARRAY['p2p'::text, 'group'::text])))
);

CREATE TABLE public.lark_inbound_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid,
    lark_chat_id text,
    event_type text NOT NULL,
    lark_event_id text,
    lark_message_id text,
    drop_reason text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lark_inbound_message_dedup (
    installation_id uuid NOT NULL,
    message_id text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    claim_token uuid DEFAULT gen_random_uuid() NOT NULL
);

CREATE TABLE public.lark_installation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    app_id text NOT NULL,
    app_secret_encrypted bytea NOT NULL,
    tenant_key text,
    bot_open_id text NOT NULL,
    installer_user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    ws_lease_token text,
    ws_lease_expires_at timestamp with time zone,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bot_union_id text,
    region text DEFAULT 'feishu'::text NOT NULL,
    CONSTRAINT lark_installation_region_check CHECK ((region = ANY (ARRAY['feishu'::text, 'lark'::text]))),
    CONSTRAINT lark_installation_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);

CREATE TABLE public.lark_outbound_card_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_session_id uuid NOT NULL,
    task_id uuid,
    lark_chat_id text NOT NULL,
    lark_card_message_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_patched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lark_outbound_card_message_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'streaming'::text, 'final'::text, 'error'::text])))
);

CREATE TABLE public.lark_user_binding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    iteamify_user_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    lark_open_id text NOT NULL,
    union_id text,
    bound_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mcp_tool_invocation (
    id uuid NOT NULL,
    surface text NOT NULL,
    server_name text NOT NULL,
    tool_name text NOT NULL,
    workspace_id uuid NOT NULL,
    agent_id uuid,
    task_id uuid NOT NULL,
    runtime_id uuid,
    succeeded boolean NOT NULL,
    duration_ms bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mcp_tool_invocation_duration_ms_check CHECK (((duration_ms >= 0) AND (duration_ms <= 86400000)))
);

CREATE TABLE public.member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);

CREATE TABLE public.notification_preference (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.outbound_email (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    chat_session_id uuid NOT NULL,
    task_id uuid,
    connection_id uuid NOT NULL,
    from_address text NOT NULL,
    to_addresses text[] NOT NULL,
    cc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    bcc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    claim_token uuid,
    error_code text DEFAULT ''::text NOT NULL,
    gmail_message_id text DEFAULT ''::text NOT NULL,
    gmail_thread_id text DEFAULT ''::text NOT NULL,
    queued_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outbound_email_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT outbound_email_version_check CHECK ((version > 0))
);

CREATE TABLE public.password_login_attempt (
    email text NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.personal_access_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pinned_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    item_type text NOT NULL,
    item_id uuid NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pinned_item_item_type_check CHECK ((item_type = ANY (ARRAY['issue'::text, 'project'::text])))
);

CREATE TABLE public.project (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    icon text,
    status text DEFAULT 'planned'::text NOT NULL,
    lead_type text,
    lead_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    priority text DEFAULT 'none'::text NOT NULL,
    start_date date,
    due_date date,
    CONSTRAINT project_lead_type_check CHECK ((lead_type = ANY (ARRAY['member'::text, 'agent'::text]))),
    CONSTRAINT project_priority_check CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'medium'::text, 'low'::text, 'none'::text]))),
    CONSTRAINT project_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE public.project_resource (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_ref jsonb NOT NULL,
    label text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

CREATE TABLE public.reddit_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reddit_user_id text NOT NULL,
    username text NOT NULL,
    refresh_token bytea NOT NULL,
    scopes text NOT NULL,
    can_reply boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reddit_connection_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);

CREATE TABLE public.reddit_oauth_state (
    state_hash bytea NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    connection_id uuid,
    can_reply boolean NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    CONSTRAINT reddit_oauth_state_state_hash_check CHECK ((octet_length(state_hash) = 32))
);

CREATE TABLE public.reddit_reply_draft (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    task_id uuid,
    target_fullname text NOT NULL,
    subreddit text NOT NULL,
    post_fullname text NOT NULL,
    target_version text NOT NULL,
    body text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    approved_version integer,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    sent_fullname text DEFAULT ''::text NOT NULL,
    error_code text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    source_checked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reddit_reply_draft_body_check CHECK ((char_length(body) <= 9500)),
    CONSTRAINT reddit_reply_draft_check CHECK (((status <> ALL (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'unknown'::text])) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL) AND (approved_version = version)))),
    CONSTRAINT reddit_reply_draft_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'unknown'::text, 'cancelled'::text]))),
    CONSTRAINT reddit_reply_draft_version_check CHECK ((version > 0))
);

CREATE TABLE public.reddit_request_budget (
    client_id text NOT NULL,
    remaining integer DEFAULT 90 NOT NULL,
    reset_at timestamp with time zone DEFAULT (now() + '00:01:00'::interval) NOT NULL,
    blocked_until timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.runtime_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    display_name text NOT NULL,
    protocol_family text NOT NULL,
    command_name text NOT NULL,
    description text,
    fixed_args jsonb DEFAULT '[]'::jsonb NOT NULL,
    visibility text DEFAULT 'workspace'::text NOT NULL,
    created_by uuid,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT runtime_profile_protocol_family_shape_check CHECK ((((char_length(protocol_family) >= 1) AND (char_length(protocol_family) <= 64)) AND (protocol_family ~ '^[a-z][a-z0-9_-]*$'::text))),
    CONSTRAINT runtime_profile_visibility_check CHECK ((visibility = ANY (ARRAY['workspace'::text, 'private'::text])))
);

CREATE TABLE public.session_application (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    application_type text NOT NULL,
    target_kind text NOT NULL,
    target_id uuid NOT NULL,
    status text NOT NULL,
    config jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_application_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'enabled'::text, 'paused'::text]))),
    CONSTRAINT session_application_target_kind_check CHECK ((target_kind = ANY (ARRAY['member'::text, 'agent'::text]))),
    CONSTRAINT session_application_version_check CHECK ((version > 0))
);

CREATE TABLE public.skill (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.skill_file (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    path text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.skill_to_label (
    skill_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.squad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    leader_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    avatar_url text,
    instructions text DEFAULT ''::text NOT NULL
);

CREATE TABLE public.squad_member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    squad_id uuid NOT NULL,
    member_type text NOT NULL,
    member_id uuid NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT squad_member_member_type_check CHECK ((member_type = ANY (ARRAY['agent'::text, 'member'::text])))
);

CREATE TABLE public.sys_cron_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    scope_kind text DEFAULT 'global'::text NOT NULL,
    scope_id text DEFAULT 'global'::text NOT NULL,
    plan_time timestamp with time zone NOT NULL,
    status text NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone,
    runner_id text,
    lease_token uuid DEFAULT gen_random_uuid() NOT NULL,
    heartbeat_at timestamp with time zone,
    stale_after timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_ms integer,
    rows_affected bigint,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code text,
    error_msg text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_sys_cron_attempt CHECK (((attempt >= 1) AND (max_attempts >= attempt))),
    CONSTRAINT chk_sys_cron_duration CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT chk_sys_cron_status CHECK ((status = ANY (ARRAY['RUNNING'::text, 'SUCCESS'::text, 'FAILED'::text])))
);

CREATE TABLE public.task_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    seq integer NOT NULL,
    type text NOT NULL,
    tool text,
    content text,
    input jsonb,
    output text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.task_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    task_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.task_token_credit_rate_snapshot (
    task_id uuid NOT NULL,
    rate_version bigint NOT NULL,
    credits_micro_per_million_tokens bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_token_credit_rate_snapshot_value_positive CHECK ((credits_micro_per_million_tokens > 0)),
    CONSTRAINT task_token_credit_rate_snapshot_version_positive CHECK ((rate_version > 0))
);

CREATE TABLE public.task_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    provider text DEFAULT ''::text NOT NULL,
    model text NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cache_read_tokens bigint DEFAULT 0 NOT NULL,
    cache_write_tokens bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    cost_usd_ticks bigint,
    credit_micro bigint DEFAULT 0 NOT NULL,
    token_credit_rate_version bigint,
    credits_micro_per_million_tokens bigint,
    settled_credit_micro bigint DEFAULT 0 NOT NULL,
    CONSTRAINT task_usage_settled_credit_micro_check CHECK ((settled_credit_micro >= 0))
);

CREATE TABLE public.task_usage_hourly (
    bucket_hour timestamp with time zone NOT NULL,
    workspace_id uuid NOT NULL,
    runtime_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    project_id uuid,
    provider text NOT NULL,
    model text NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cache_read_tokens bigint DEFAULT 0 NOT NULL,
    cache_write_tokens bigint DEFAULT 0 NOT NULL,
    task_count bigint DEFAULT 0 NOT NULL,
    event_count bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cost_usd_ticks bigint DEFAULT 0 NOT NULL,
    uncosted_input_tokens bigint,
    uncosted_output_tokens bigint,
    uncosted_cache_read_tokens bigint,
    uncosted_cache_write_tokens bigint
);

CREATE TABLE public.task_usage_hourly_dirty (
    bucket_hour timestamp with time zone NOT NULL,
    workspace_id uuid NOT NULL,
    runtime_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    project_id uuid,
    provider text NOT NULL,
    model text NOT NULL,
    enqueued_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.task_usage_hourly_rollup_state (
    id smallint DEFAULT 1 NOT NULL,
    watermark_at timestamp with time zone DEFAULT '1970-01-01 08:00:00+08'::timestamp with time zone NOT NULL,
    last_run_started_at timestamp with time zone,
    last_run_finished_at timestamp with time zone,
    last_run_rows bigint DEFAULT 0 NOT NULL,
    last_error text,
    CONSTRAINT task_usage_hourly_rollup_state_id_check CHECK ((id = 1))
);

CREATE TABLE public.token_credit_rate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version bigint NOT NULL,
    credits_micro_per_million_tokens bigint NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_credit_rate_value_positive CHECK ((credits_micro_per_million_tokens > 0)),
    CONSTRAINT token_credit_rate_version_positive CHECK ((version > 0))
);

CREATE TABLE public."user" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    onboarded_at timestamp with time zone,
    onboarding_questionnaire jsonb DEFAULT '{}'::jsonb NOT NULL,
    cloud_waitlist_email character varying(254),
    cloud_waitlist_reason text,
    starter_content_state text,
    language character varying(20) DEFAULT NULL::character varying,
    profile_description text DEFAULT ''::text NOT NULL,
    timezone text
);

CREATE TABLE public.user_composio_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    toolkit_slug text NOT NULL,
    auth_config_id text NOT NULL,
    connected_account_id text NOT NULL,
    composio_user_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_gmail_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_address text NOT NULL,
    refresh_token_ciphertext bytea NOT NULL,
    granted_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    history_id text,
    watch_expiration timestamp with time zone,
    last_sync_at timestamp with time zone,
    last_error_code text,
    last_error_at timestamp with time zone,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    disconnected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_gmail_connection_status_check CHECK ((status = ANY (ARRAY['active'::text, 'attention'::text, 'disconnected'::text])))
);

CREATE TABLE public.user_password (
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    auth_version bigint DEFAULT 1 NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_password_auth_version_check CHECK ((auth_version > 0))
);

CREATE TABLE public.vcs_commit_status (
    connection_id uuid NOT NULL,
    sha text NOT NULL,
    context text NOT NULL,
    state text NOT NULL,
    target_url text,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vcs_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider text DEFAULT 'forgejo'::text NOT NULL,
    instance_url text NOT NULL,
    account_login text NOT NULL,
    access_token_encrypted text NOT NULL,
    webhook_secret_encrypted text NOT NULL,
    connected_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vcs_connection_provider_check CHECK ((provider = ANY (ARRAY['forgejo'::text, 'gitea'::text, 'gitlab'::text])))
);

CREATE TABLE public.vcs_pull_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    provider text DEFAULT 'forgejo'::text NOT NULL,
    repo_owner text NOT NULL,
    repo_name text NOT NULL,
    pr_number integer NOT NULL,
    title text NOT NULL,
    state text NOT NULL,
    html_url text NOT NULL,
    branch text,
    head_sha text DEFAULT ''::text NOT NULL,
    author_login text,
    author_avatar_url text,
    merged_at timestamp with time zone,
    closed_at timestamp with time zone,
    pr_created_at timestamp with time zone NOT NULL,
    pr_updated_at timestamp with time zone NOT NULL,
    additions integer DEFAULT 0 NOT NULL,
    deletions integer DEFAULT 0 NOT NULL,
    changed_files integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vcs_pull_request_provider_check CHECK ((provider = ANY (ARRAY['forgejo'::text, 'gitea'::text, 'gitlab'::text]))),
    CONSTRAINT vcs_pull_request_state_check CHECK ((state = ANY (ARRAY['open'::text, 'closed'::text, 'merged'::text, 'draft'::text])))
);

CREATE TABLE public.verification_code (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.webhook_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    autopilot_id uuid NOT NULL,
    trigger_id uuid NOT NULL,
    provider text NOT NULL,
    event text DEFAULT 'webhook.received'::text NOT NULL,
    dedupe_key text,
    dedupe_source text,
    signature_status text DEFAULT 'not_required'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    selected_headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    content_type text,
    raw_body bytea,
    response_status integer,
    response_body text,
    autopilot_run_id uuid,
    replayed_from_delivery_id uuid,
    error text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    dispatch_attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT webhook_delivery_provider_check CHECK ((provider = ANY (ARRAY['generic'::text, 'github'::text]))),
    CONSTRAINT webhook_delivery_signature_status_check CHECK ((signature_status = ANY (ARRAY['not_required'::text, 'valid'::text, 'invalid'::text, 'missing'::text]))),
    CONSTRAINT webhook_delivery_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'rejected'::text, 'ignored'::text, 'failed'::text])))
);

CREATE TABLE public.workspace (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    context text,
    repos jsonb DEFAULT '[]'::jsonb NOT NULL,
    issue_prefix text DEFAULT ''::text NOT NULL,
    issue_counter integer DEFAULT 0 NOT NULL,
    avatar_url text,
    attribution_fail_closed boolean DEFAULT false NOT NULL
);

CREATE TABLE public.workspace_credit_account (
    workspace_id uuid NOT NULL,
    balance_micro bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_credit_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    business_key text NOT NULL,
    kind text NOT NULL,
    amount_micro bigint NOT NULL,
    balance_after bigint NOT NULL,
    reference_id text DEFAULT ''::text NOT NULL,
    actor_id uuid,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_credit_ledger_amount_micro_check CHECK ((amount_micro <> 0)),
    CONSTRAINT workspace_credit_ledger_business_key_check CHECK (((length(business_key) >= 1) AND (length(business_key) <= 500))),
    CONSTRAINT workspace_credit_ledger_kind_check CHECK ((kind = ANY (ARRAY['trial'::text, 'topup'::text, 'usage'::text, 'adjustment'::text])))
);

CREATE TABLE public.workspace_credit_operation_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    operation_key text NOT NULL,
    operation_type text NOT NULL,
    cumulative_credit_micro bigint NOT NULL,
    source_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    last_error text DEFAULT ''::text NOT NULL,
    settled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_credit_operation_outbox_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT workspace_credit_operation_outbox_cumulative_credit_micro_check CHECK ((cumulative_credit_micro >= 0)),
    CONSTRAINT workspace_credit_operation_outbox_operation_key_check CHECK (((length(operation_key) >= 1) AND (length(operation_key) <= 500))),
    CONSTRAINT workspace_credit_operation_outbox_operation_type_check CHECK ((operation_type = ANY (ARRAY['trial_grant'::text, 'usage_settlement'::text]))),
    CONSTRAINT workspace_credit_operation_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'settled'::text, 'dead_letter'::text])))
);

CREATE TABLE public.workspace_invitation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    inviter_id uuid NOT NULL,
    invitee_email text NOT NULL,
    invitee_user_id uuid,
    role text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    CONSTRAINT workspace_invitation_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text]))),
    CONSTRAINT workspace_invitation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
);

CREATE TABLE public.workspace_openagent_config (
    workspace_id uuid NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    base_url text NOT NULL,
    model text NOT NULL,
    api_key_encrypted bytea NOT NULL,
    updated_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_openagent_config_revision_check CHECK ((revision > 0))
);

CREATE TABLE public.workspace_topup_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    payer_user_id uuid NOT NULL,
    request_key text NOT NULL,
    amount_cents bigint NOT NULL,
    credits_micro bigint NOT NULL,
    credits_micro_per_usd bigint NOT NULL,
    return_url text NOT NULL,
    stripe_checkout_id text DEFAULT ''::text NOT NULL,
    checkout_url text DEFAULT ''::text NOT NULL,
    stripe_payment_id text DEFAULT ''::text NOT NULL,
    stripe_event_id text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_topup_order_amount_cents_check CHECK (((amount_cents > 0) AND (amount_cents <= 99999999))),
    CONSTRAINT workspace_topup_order_credits_micro_check CHECK ((credits_micro > 0)),
    CONSTRAINT workspace_topup_order_credits_micro_per_usd_check CHECK ((credits_micro_per_usd > 0)),
    CONSTRAINT workspace_topup_order_request_key_check CHECK (((length(request_key) >= 1) AND (length(request_key) <= 128))),
    CONSTRAINT workspace_topup_order_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'credited'::text, 'canceled'::text])))
);

CREATE FUNCTION public.clear_runtime_mcp_overlay_on_terminal_state() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status IN ('completed', 'failed', 'cancelled')
       AND OLD.status IS DISTINCT FROM NEW.status
       AND (NEW.runtime_mcp_overlay IS NOT NULL OR NEW.runtime_connected_apps IS NOT NULL) THEN
        NEW.runtime_mcp_overlay := NULL;
        NEW.runtime_connected_apps := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.enqueue_task_usage_hourly_dirty_for_atq() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.runtime_id IS DISTINCT FROM NEW.runtime_id
           OR OLD.issue_id IS DISTINCT FROM NEW.issue_id THEN
            -- OLD side. NULL runtime_id rows are not aggregated (no
            -- runtime → no bucket); skip those.
            IF OLD.runtime_id IS NOT NULL THEN
                INSERT INTO task_usage_hourly_dirty (
                    bucket_hour, workspace_id, runtime_id, agent_id,
                    project_id, provider, model
                )
                SELECT DISTINCT
                    task_usage_hour_bucket(tu.created_at),
                    a.workspace_id,
                    OLD.runtime_id,
                    OLD.agent_id,
                    i_old.project_id,
                    tu.provider,
                    tu.model
                  FROM task_usage tu
                  JOIN agent a ON a.id = OLD.agent_id
                  LEFT JOIN issue i_old ON i_old.id = OLD.issue_id
                 WHERE tu.task_id = OLD.id
                ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
                    SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);
            END IF;

            IF NEW.runtime_id IS NOT NULL THEN
                INSERT INTO task_usage_hourly_dirty (
                    bucket_hour, workspace_id, runtime_id, agent_id,
                    project_id, provider, model
                )
                SELECT DISTINCT
                    task_usage_hour_bucket(tu.created_at),
                    a.workspace_id,
                    NEW.runtime_id,
                    NEW.agent_id,
                    i_new.project_id,
                    tu.provider,
                    tu.model
                  FROM task_usage tu
                  JOIN agent a ON a.id = NEW.agent_id
                  LEFT JOIN issue i_new ON i_new.id = NEW.issue_id
                 WHERE tu.task_id = NEW.id
                ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
                    SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.runtime_id IS NOT NULL THEN
            INSERT INTO task_usage_hourly_dirty (
                bucket_hour, workspace_id, runtime_id, agent_id,
                project_id, provider, model
            )
            SELECT DISTINCT
                task_usage_hour_bucket(tu.created_at),
                a.workspace_id,
                OLD.runtime_id,
                OLD.agent_id,
                i.project_id,
                tu.provider,
                tu.model
              FROM task_usage tu
              JOIN agent a ON a.id = OLD.agent_id
              LEFT JOIN issue i ON i.id = OLD.issue_id
             WHERE tu.task_id = OLD.id
            ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
                SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION public.enqueue_task_usage_hourly_dirty_for_issue_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO task_usage_hourly_dirty (
        bucket_hour, workspace_id, runtime_id, agent_id,
        project_id, provider, model
    )
    SELECT DISTINCT
        task_usage_hour_bucket(tu.created_at),
        OLD.workspace_id,
        atq.runtime_id,
        atq.agent_id,
        OLD.project_id,
        tu.provider,
        tu.model
      FROM agent_task_queue atq
      JOIN task_usage tu ON tu.task_id = atq.id
     WHERE atq.issue_id = OLD.id
       AND atq.runtime_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
        SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);
    RETURN OLD;
END;
$$;

CREATE FUNCTION public.enqueue_task_usage_hourly_dirty_for_issue_project() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
        -- OLD project buckets.
        INSERT INTO task_usage_hourly_dirty (
            bucket_hour, workspace_id, runtime_id, agent_id,
            project_id, provider, model
        )
        SELECT DISTINCT
            task_usage_hour_bucket(tu.created_at),
            NEW.workspace_id,
            atq.runtime_id,
            atq.agent_id,
            OLD.project_id,
            tu.provider,
            tu.model
          FROM agent_task_queue atq
          JOIN task_usage tu ON tu.task_id = atq.id
         WHERE atq.issue_id = NEW.id
           AND atq.runtime_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
            SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);

        -- NEW project buckets.
        INSERT INTO task_usage_hourly_dirty (
            bucket_hour, workspace_id, runtime_id, agent_id,
            project_id, provider, model
        )
        SELECT DISTINCT
            task_usage_hour_bucket(tu.created_at),
            NEW.workspace_id,
            atq.runtime_id,
            atq.agent_id,
            NEW.project_id,
            tu.provider,
            tu.model
          FROM agent_task_queue atq
          JOIN task_usage tu ON tu.task_id = atq.id
         WHERE atq.issue_id = NEW.id
           AND atq.runtime_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
            SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.enqueue_task_usage_hourly_dirty_for_tu() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO task_usage_hourly_dirty (
        bucket_hour, workspace_id, runtime_id, agent_id,
        project_id, provider, model
    )
    SELECT
        task_usage_hour_bucket(OLD.created_at),
        a.workspace_id,
        atq.runtime_id,
        atq.agent_id,
        i.project_id,
        OLD.provider,
        OLD.model
      FROM agent_task_queue atq
      JOIN agent a ON a.id = atq.agent_id
      LEFT JOIN issue i ON i.id = atq.issue_id
     WHERE atq.id = OLD.task_id
       AND atq.runtime_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_dirty_key DO UPDATE
        SET enqueued_at = GREATEST(task_usage_hourly_dirty.enqueued_at, EXCLUDED.enqueued_at);
    RETURN OLD;
END;
$$;

CREATE FUNCTION public.prune_task_usage_hourly_dirty(p_retention interval DEFAULT '7 days'::interval) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_rows BIGINT;
BEGIN
    DELETE FROM task_usage_hourly_dirty
     WHERE enqueued_at < now() - p_retention;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END;
$$;

CREATE FUNCTION public.rollup_task_usage_hourly() RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_lock_ok BOOLEAN;
    v_from    TIMESTAMPTZ;
    v_to      TIMESTAMPTZ;
    v_rows    BIGINT := 0;
BEGIN
    SELECT pg_try_advisory_lock(4246) INTO v_lock_ok;
    IF NOT v_lock_ok THEN
        RETURN 0;
    END IF;

    BEGIN
        UPDATE task_usage_hourly_rollup_state
           SET last_run_started_at = now(),
               last_error          = NULL
         WHERE id = 1
        RETURNING watermark_at INTO v_from;

        -- Cap each tick at a one-day window. In steady state v_from is
        -- recent, so LEAST picks `now() - 5 min` and nothing changes. But
        -- if the worker was paused (incident, migration freeze) the
        -- watermark can fall far behind; without the cap a single catch-up
        -- tick would recompute a multi-week window in one statement while
        -- holding lock 4246, blocking every other tick. Capped, catch-up
        -- advances in bounded one-day steps over successive ticks.
        v_to := LEAST(now() - INTERVAL '5 minutes', v_from + INTERVAL '1 day');

        IF v_from < v_to THEN
            v_rows := rollup_task_usage_hourly_window(v_from, v_to);

            UPDATE task_usage_hourly_rollup_state
               SET watermark_at         = v_to,
                   last_run_finished_at = now(),
                   last_run_rows        = v_rows
             WHERE id = 1;
        ELSE
            UPDATE task_usage_hourly_rollup_state
               SET last_run_finished_at = now(),
                   last_run_rows        = 0
             WHERE id = 1;
        END IF;

        PERFORM pg_advisory_unlock(4246);
    EXCEPTION WHEN OTHERS THEN
        UPDATE task_usage_hourly_rollup_state
           SET last_error           = SQLERRM,
               last_run_finished_at = now()
         WHERE id = 1;
        PERFORM pg_advisory_unlock(4246);
        RAISE;
    END;

    -- TTL prune. Runs AFTER the advisory lock is released: on a large
    -- stale backlog the prune can be slow, and holding lock 4246 through
    -- it would serialise every concurrent cron tick. It is a plain
    -- bounded DELETE — idempotent and safe to run unlocked.
    PERFORM prune_task_usage_hourly_dirty();
    RETURN v_rows;
END;
$$;

CREATE FUNCTION public.rollup_task_usage_hourly_window(p_from timestamp with time zone, p_to timestamp with time zone) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_rows BIGINT;
BEGIN
    IF p_from >= p_to THEN
        RETURN 0;
    END IF;

    WITH
    dirty_from_updates AS (
        SELECT DISTINCT
            task_usage_hour_bucket(tu.created_at) AS bucket_hour,
            a.workspace_id                        AS workspace_id,
            atq.runtime_id                        AS runtime_id,
            atq.agent_id                          AS agent_id,
            i.project_id                          AS project_id,
            tu.provider                           AS provider,
            tu.model                              AS model
          FROM task_usage tu
          JOIN agent_task_queue atq ON atq.id      = tu.task_id
          JOIN agent            a   ON a.id        = atq.agent_id
          LEFT JOIN issue       i   ON i.id        = atq.issue_id
         WHERE atq.runtime_id IS NOT NULL
           AND (
                (tu.updated_at >= p_from AND tu.updated_at < p_to)
                -- Legacy updated_at-NULL rows; partial index from 078.
                OR (tu.updated_at IS NULL
                    AND tu.created_at >= p_from
                    AND tu.created_at <  p_to)
           )
    ),
    dirty_from_queue AS (
        SELECT bucket_hour, workspace_id, runtime_id, agent_id,
               project_id, provider, model
          FROM task_usage_hourly_dirty
         WHERE enqueued_at < p_to
    ),
    dirty_keys AS (
        SELECT * FROM dirty_from_updates
        UNION
        SELECT * FROM dirty_from_queue
    ),
    recomputed AS (
        SELECT
            dk.bucket_hour,
            dk.workspace_id,
            dk.runtime_id,
            dk.agent_id,
            dk.project_id,
            dk.provider,
            dk.model,
            SUM(tu.input_tokens)::bigint       AS input_tokens,
            SUM(tu.output_tokens)::bigint      AS output_tokens,
            SUM(tu.cache_read_tokens)::bigint  AS cache_read_tokens,
            SUM(tu.cache_write_tokens)::bigint AS cache_write_tokens,
            -- Authoritative half: only rows the provider priced.
            COALESCE(SUM(tu.cost_usd_ticks), 0)::bigint AS cost_usd_ticks,
            -- Estimated half: tokens from rows the provider did not price.
            COALESCE(SUM(tu.input_tokens)       FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_input_tokens,
            COALESCE(SUM(tu.output_tokens)      FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_output_tokens,
            COALESCE(SUM(tu.cache_read_tokens)  FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_cache_read_tokens,
            COALESCE(SUM(tu.cache_write_tokens) FILTER (WHERE tu.cost_usd_ticks IS NULL), 0)::bigint AS uncosted_cache_write_tokens,
            COUNT(DISTINCT tu.task_id)::bigint AS task_count,
            COUNT(*)::bigint                   AS event_count
          FROM dirty_keys dk
          JOIN agent_task_queue atq ON atq.runtime_id  = dk.runtime_id
                                    AND atq.agent_id    = dk.agent_id
          JOIN agent            a   ON a.id            = atq.agent_id
                                    AND a.workspace_id = dk.workspace_id
          LEFT JOIN issue       i   ON i.id            = atq.issue_id
          JOIN task_usage       tu  ON tu.task_id      = atq.id
                                    AND tu.provider    = dk.provider
                                    AND tu.model       = dk.model
                                    AND task_usage_hour_bucket(tu.created_at) = dk.bucket_hour
         WHERE (i.project_id IS NOT DISTINCT FROM dk.project_id)
         GROUP BY 1, 2, 3, 4, 5, 6, 7
    ),
    upserted AS (
        INSERT INTO task_usage_hourly AS d (
            bucket_hour, workspace_id, runtime_id, agent_id,
            project_id, provider, model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            cost_usd_ticks,
            uncosted_input_tokens, uncosted_output_tokens,
            uncosted_cache_read_tokens, uncosted_cache_write_tokens,
            task_count, event_count
        )
        SELECT
            bucket_hour, workspace_id, runtime_id, agent_id,
            project_id, provider, model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            cost_usd_ticks,
            uncosted_input_tokens, uncosted_output_tokens,
            uncosted_cache_read_tokens, uncosted_cache_write_tokens,
            task_count, event_count
          FROM recomputed
        ON CONFLICT ON CONSTRAINT uq_task_usage_hourly_key DO UPDATE
            SET input_tokens                = EXCLUDED.input_tokens,
                output_tokens               = EXCLUDED.output_tokens,
                cache_read_tokens           = EXCLUDED.cache_read_tokens,
                cache_write_tokens          = EXCLUDED.cache_write_tokens,
                cost_usd_ticks              = EXCLUDED.cost_usd_ticks,
                uncosted_input_tokens       = EXCLUDED.uncosted_input_tokens,
                uncosted_output_tokens      = EXCLUDED.uncosted_output_tokens,
                uncosted_cache_read_tokens  = EXCLUDED.uncosted_cache_read_tokens,
                uncosted_cache_write_tokens = EXCLUDED.uncosted_cache_write_tokens,
                task_count                  = EXCLUDED.task_count,
                event_count                 = EXCLUDED.event_count,
                updated_at                  = now()
        RETURNING 1
    ),
    deleted_empty AS (
        DELETE FROM task_usage_hourly d
         USING dirty_keys dk
         WHERE d.bucket_hour  = dk.bucket_hour
           AND d.workspace_id = dk.workspace_id
           AND d.runtime_id   = dk.runtime_id
           AND d.agent_id     = dk.agent_id
           AND d.project_id IS NOT DISTINCT FROM dk.project_id
           AND d.provider     = dk.provider
           AND d.model        = dk.model
           AND NOT EXISTS (
               SELECT 1 FROM recomputed r
                WHERE r.bucket_hour  = dk.bucket_hour
                  AND r.workspace_id = dk.workspace_id
                  AND r.runtime_id   = dk.runtime_id
                  AND r.agent_id     = dk.agent_id
                  AND r.project_id IS NOT DISTINCT FROM dk.project_id
                  AND r.provider     = dk.provider
                  AND r.model        = dk.model
           )
        RETURNING 1
    )
    SELECT (SELECT COUNT(*) FROM upserted) + (SELECT COUNT(*) FROM deleted_empty)
      INTO v_rows;

    DELETE FROM task_usage_hourly_dirty WHERE enqueued_at < p_to;

    RETURN v_rows;
END;
$$;

CREATE FUNCTION public.task_usage_hour_bucket(ts timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT (date_trunc('hour', ts AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC';
$$;

CREATE FUNCTION public.task_usage_hourly_rollup_lag_seconds() RETURNS double precision
    LANGUAGE sql STABLE
    AS $$
    SELECT EXTRACT(EPOCH FROM (now() - last_run_finished_at))
      FROM task_usage_hourly_rollup_state
     WHERE id = 1;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TRIGGER trg_atq_dirty_hourly BEFORE DELETE OR UPDATE OF runtime_id, issue_id ON public.agent_task_queue FOR EACH ROW EXECUTE FUNCTION public.enqueue_task_usage_hourly_dirty_for_atq();

CREATE TRIGGER trg_clear_runtime_mcp_overlay BEFORE UPDATE OF status ON public.agent_task_queue FOR EACH ROW EXECUTE FUNCTION public.clear_runtime_mcp_overlay_on_terminal_state();

CREATE TRIGGER trg_issue_delete_dirty_hourly BEFORE DELETE ON public.issue FOR EACH ROW EXECUTE FUNCTION public.enqueue_task_usage_hourly_dirty_for_issue_delete();

CREATE TRIGGER trg_issue_project_dirty_hourly BEFORE UPDATE OF project_id ON public.issue FOR EACH ROW EXECUTE FUNCTION public.enqueue_task_usage_hourly_dirty_for_issue_project();

CREATE TRIGGER trg_tu_dirty_hourly BEFORE DELETE ON public.task_usage FOR EACH ROW EXECUTE FUNCTION public.enqueue_task_usage_hourly_dirty_for_tu();

COMMENT ON COLUMN public.agent.composio_toolkit_allowlist IS 'Composio toolkit slugs this agent is allowed to mount as MCP. NULL or empty array = no MCP overlay. Mounted for any run that passes the agent invocation-permission gate (MUL-3963); the overlay uses the agent OWNER''s active Composio connection, so sharing the agent (public_to) shares these apps with whoever may invoke it. No longer gated on originator == owner. Stored as TEXT[] so the dispatch path can intersect against the owner''s active connections with a single SQL ANY() filter.';

COMMENT ON COLUMN public.agent.permission_mode IS 'Agent invocation permission mode (MUL-3963). private = owner only; public_to = allow-list in agent_invocation_target. Replaces visibility as the authorization source for triggering runs; visibility is now a derived legacy field. Default private = deny-by-default.';

COMMENT ON TABLE public.agent_invocation_target IS 'Allow-list of who may invoke a public_to agent (MUL-3963). One row per (agent, target_type, target); targets stack and canInvokeAgent OR-matches. workspace rows store the agent workspace_id in target_id; member rows store the user id; team rows are reserved and inert in V1. Rows only matter when agent.permission_mode = public_to. No DB foreign keys: agent_id / created_by / member target_id relationships are maintained in the application layer (see migration comment).';

COMMENT ON COLUMN public.agent_task_queue.runtime_mcp_overlay IS 'Per-task MCP servers computed at dispatch time, merged on top of agent.mcp_config. Currently used by Composio integration to inject the initiator user''s session URL. Cleared after task completes via trg_clear_runtime_mcp_overlay.';

COMMENT ON COLUMN public.agent_task_queue.originator_user_id IS 'Top-of-chain human originator for this run. For human-triggered tasks (comment by a member, chat, quick-create) equals that member. For agent-fanout tasks inherited from the parent task''s originator_user_id via comment.source_task_id. NULL when no human is in the chain (autopilot, system-driven). Used by canInvokeAgent to judge A2A by the originator; the Composio overlay now follows invocation permission and uses the agent owner''s connection, so this is audit/attribution + A2A gating, NOT a Composio owner==originator gate (MUL-3963).';

COMMENT ON COLUMN public.agent_task_queue.runtime_connected_apps IS 'Non-secret per-task connected app metadata corresponding to runtime_mcp_overlay, used by the daemon brief to tell agents which app capabilities are mounted. Cleared with runtime_mcp_overlay after task completion.';

COMMENT ON COLUMN public.agent_task_queue.originator_source IS 'Waterfall level that resolved originator_user_id for this run: direct_human | delegation | comment_source | rule_owner | owner_fallback | backfill | unattributed. Audit/visibility metadata only — never consulted for authorization. TEXT with no CHECK so new trigger paths can add a source without a migration (MUL-4302 §7). NULL on pre-migration rows.';

COMMENT ON COLUMN public.agent_task_queue.delegated_from_task_id IS 'For originator_source=delegation: the parent task whose accountable human was copied onto this run. Value is copied, not chained, so delegation cycles are harmless (MUL-4302 §3.2). No FK; app-layer integrity only.';

COMMENT ON COLUMN public.agent_task_queue.retry_of_task_id IS 'System transient-failure retry lineage: the task this run re-attempts. Inherits the parent attribution unchanged. Kept distinct from rerun_of_task_id so retry vs rerun report separately (MUL-4302 §5). No FK.';

COMMENT ON COLUMN public.agent_task_queue.rerun_of_task_id IS 'Human manual-rerun lineage: the historical task a member re-ran. The rerun itself is a NEW direct_human attribution to the rerunning member; this column preserves the link to the original (MUL-4302 §5). No FK.';

COMMENT ON COLUMN public.agent_task_queue.rule_version_id IS 'For originator_source=rule_owner: the published autopilot rule version snapshot whose publisher is the accountable human. No FK; snapshot table wiring lands in a later Phase 1 increment (MUL-4302 §3.4/§7).';

COMMENT ON COLUMN public.agent_task_queue.trigger_evidence_kind IS 'Uniform kind tag for the direct cause of this run (comment | issue_assignment | autopilot_run | rule_version | rerun | ...), paired with trigger_evidence_ref_id. Free TEXT so new evidence kinds need no migration (MUL-4302 §2).';

COMMENT ON COLUMN public.agent_task_queue.trigger_evidence_ref_id IS 'The row id referenced by trigger_evidence_kind (a comment id, autopilot_run id, rule_version id, source task id, ...). No FK; resolvable per-kind in the app layer (MUL-4302 §2).';

COMMENT ON COLUMN public.agent_task_queue.accountable_user_id IS 'The one human accountable for this run, for audit / visibility / cost only — NEVER consulted for authorization (that is originator_user_id). Invariant: when originator_user_id IS NOT NULL, this equals it; the two diverge only when originator_user_id IS NULL (autopilot rule_owner / degraded owner_fallback name an accountable human while authorization carries none). No FK, no cascade (MUL-4302 §1/§7). NULL means no accountable human was resolved: a pre-migration row, OR a NEW row whose audit source is not-yet-resolved / unattributed (e.g. run_only autopilot until rule_owner lands) — NOT pre-migration only.';

COMMENT ON COLUMN public.agent_task_queue.local_billing_enabled IS 'Set transactionally only when a task starts under local billing. Historical/running tasks are not retroactively charged.';

COMMENT ON TABLE public.autopilot_rule_version IS 'Append-only snapshot of autopilot rule publishes (MUL-4302 §3.4). One row per substantive publish (create / enable / resume / trigger-condition / target / instructions change), recording the publisher + effective-config summary. Dispatch resolves the latest row for an autopilot as the run''s rule_owner accountable human. No FK, no cascade.';

COMMENT ON COLUMN public.autopilot_trigger.published_by_type IS 'Actor type of the trigger''s current responsible publisher: member | agent. Set to the creator at creation and re-stamped to the editor on any substantive edit governing this trigger. Consumed only for attribution (source=trigger_owner) — never authorization. NULL on pre-migration triggers (MUL-4302).';

COMMENT ON COLUMN public.autopilot_trigger.published_by_id IS 'The member/agent currently responsible for this trigger''s effective config (creator, then last substantive editor). For a member this is the accountable human of runs the trigger fires (source=trigger_owner). No FK, app-layer integrity. NULL on pre-migration triggers, which degrade to rule_owner (MUL-4302).';

COMMENT ON COLUMN public.task_usage.cost_usd_ticks IS 'Provider-reported cost in 1e-10 USD. NULL when the provider reports none; those rows are priced client-side from the static rate table.';

COMMENT ON COLUMN public.task_usage.credit_micro IS 'User-facing credits in microcredits, calculated from all four token counters with the task rate snapshot.';

COMMENT ON COLUMN public.task_usage_hourly.cost_usd_ticks IS 'Sum of provider-reported cost (1e-10 USD) over the rows in this bucket that had one; 0 when none did.';

COMMENT ON COLUMN public.task_usage_hourly.uncosted_input_tokens IS 'Input tokens from rows with no provider-reported cost — the portion still priced from the static rate table. NULL on buckets not yet recomputed since this column existed; readers COALESCE to input_tokens.';

COMMENT ON TABLE public.token_credit_rate IS 'Versioned deployment-wide user billing rate. Every input, output, cache-read, and cache-write token uses this one rate.';

COMMENT ON COLUMN public.token_credit_rate.credits_micro_per_million_tokens IS 'Microcredits charged per 1,000,000 tokens. 1 credit = 1,000,000 microcredits.';

COMMENT ON COLUMN public."user".timezone IS 'User-preferred IANA timezone for report rendering (Viewing tz). NULL means "use the browser-detected tz at render time". Affects dashboards, charts, and any "today" label shown to this user. Does not affect data materialisation — all rollups remain in UTC.';

COMMENT ON COLUMN public.workspace.attribution_fail_closed IS 'When TRUE, an agent run that resolves to no precise accountable human (would be owner_fallback) is refused at enqueue instead of degrading to the agent owner (MUL-4302 §3.5). Default FALSE = owner_fallback. Never affects authorization (originator_user_id).';

COMMENT ON TABLE public.workspace_credit_operation_outbox IS 'Durable, coalescing handoff from Aurocreator usage/workspace facts to the authoritative iteamify-cloud workspace wallet.';
