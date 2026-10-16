-- Generalize service transactions to support either an internal Chat or a
-- Public Expert conversation. Existing rows remain internal_chat by default.
ALTER TABLE service_quote
    ALTER COLUMN chat_session_id DROP NOT NULL,
    ADD COLUMN conversation_type TEXT NOT NULL DEFAULT 'internal_chat',
    ADD COLUMN public_expert_session_id UUID,
    ADD COLUMN page_release_id UUID,
    ADD COLUMN source_task_type TEXT NOT NULL DEFAULT 'agent_task',
    ADD COLUMN public_ref TEXT,
    ADD COLUMN revision INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN action_key TEXT,
    ADD COLUMN action_payload_hash BYTEA,
    ADD COLUMN discount_bps INTEGER,
    ADD COLUMN pricing_audit JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD CONSTRAINT service_quote_conversation_type_check
        CHECK (conversation_type IN ('internal_chat', 'public_expert')),
    ADD CONSTRAINT service_quote_source_task_type_check
        CHECK (source_task_type IN ('agent_task', 'public_expert_task')),
    ADD CONSTRAINT service_quote_revision_check CHECK (revision > 0),
    ADD CONSTRAINT service_quote_discount_bps_check
        CHECK (discount_bps IS NULL OR discount_bps BETWEEN 0 AND 9999),
    ADD CONSTRAINT service_quote_pricing_audit_check
        CHECK (jsonb_typeof(pricing_audit) = 'object'),
    ADD CONSTRAINT service_quote_public_ref_check
        CHECK (public_ref IS NULL OR length(public_ref) BETWEEN 22 AND 128),
    ADD CONSTRAINT service_quote_action_key_check
        CHECK (action_key IS NULL OR length(action_key) BETWEEN 1 AND 200),
    ADD CONSTRAINT service_quote_action_payload_hash_check
        CHECK (action_payload_hash IS NULL OR octet_length(action_payload_hash) = 32),
    ADD CONSTRAINT service_quote_conversation_source_check
        CHECK (
            (conversation_type = 'internal_chat'
                AND chat_session_id IS NOT NULL
                AND public_expert_session_id IS NULL
                AND page_release_id IS NULL
                AND source_task_type = 'agent_task'
                AND public_ref IS NULL
                AND action_key IS NULL
                AND action_payload_hash IS NULL)
            OR (conversation_type = 'public_expert'
                AND chat_session_id IS NULL
                AND public_expert_session_id IS NOT NULL
                AND page_release_id IS NOT NULL
                AND source_task_type = 'public_expert_task'
                AND public_ref IS NOT NULL
                AND action_key IS NOT NULL
                AND action_payload_hash IS NOT NULL
                AND discount_bps IS NOT NULL)
        );

ALTER TABLE service_order
    ALTER COLUMN chat_session_id DROP NOT NULL,
    ADD COLUMN conversation_type TEXT NOT NULL DEFAULT 'internal_chat',
    ADD COLUMN public_expert_session_id UUID,
    ADD COLUMN page_release_id UUID,
    ADD CONSTRAINT service_order_conversation_type_check
        CHECK (conversation_type IN ('internal_chat', 'public_expert')),
    ADD CONSTRAINT service_order_conversation_source_check
        CHECK (
            (conversation_type = 'internal_chat'
                AND chat_session_id IS NOT NULL
                AND public_expert_session_id IS NULL
                AND page_release_id IS NULL)
            OR (conversation_type = 'public_expert'
                AND chat_session_id IS NULL
                AND public_expert_session_id IS NOT NULL
                AND page_release_id IS NOT NULL)
        );

ALTER TABLE lead_sources
    DROP CONSTRAINT lead_sources_source_type_check,
    ADD COLUMN public_expert_session_id UUID,
    ADD CONSTRAINT lead_sources_source_type_check
        CHECK (source_type IN ('lead_mining', 'chat', 'manual', 'quote', 'import', 'api', 'public_expert'));

ALTER TABLE lead_activities
    DROP CONSTRAINT lead_activities_activity_type_check,
    ADD COLUMN public_expert_session_id UUID,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN ('created', 'updated', 'note', 'stage_changed', 'quote_accepted', 'contact_captured', 'quote_sent', 'follow_up_requested'));

ALTER TABLE inbox_item
    ADD COLUMN event_key TEXT,
    ADD CONSTRAINT inbox_item_event_key_check
        CHECK (event_key IS NULL OR length(event_key) BETWEEN 1 AND 200);
