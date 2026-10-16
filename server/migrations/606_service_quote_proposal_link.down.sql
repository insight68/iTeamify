ALTER TABLE service_quote DROP CONSTRAINT service_quote_priced_check;

ALTER TABLE service_quote DROP CONSTRAINT service_quote_conversation_source_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_conversation_source_check
    CHECK (
        (
            conversation_type = 'internal_chat'
            AND chat_session_id IS NOT NULL
            AND public_expert_session_id IS NULL
            AND page_release_id IS NULL
            AND source_task_type = 'agent_task'
            AND public_ref IS NULL
            AND action_key IS NULL
            AND action_payload_hash IS NULL
        )
        OR (
            conversation_type = 'public_expert'
            AND chat_session_id IS NULL
            AND public_expert_session_id IS NOT NULL
            AND page_release_id IS NOT NULL
            AND source_task_type = 'public_expert_task'
            AND public_ref IS NOT NULL
            AND action_key IS NOT NULL
            AND action_payload_hash IS NOT NULL
            AND discount_bps IS NOT NULL
        )
    );

ALTER TABLE service_quote DROP CONSTRAINT service_quote_conversation_type_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_conversation_type_check
    CHECK (conversation_type IN ('internal_chat', 'public_expert'));

ALTER TABLE service_quote DROP CONSTRAINT service_quote_total_minor_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_total_minor_check
    CHECK (total_minor > 0);

ALTER TABLE service_quote DROP CONSTRAINT service_quote_subtotal_minor_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_subtotal_minor_check
    CHECK (subtotal_minor > 0);

ALTER TABLE service_quote DROP CONSTRAINT service_quote_source_task_type_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_source_task_type_check
    CHECK (source_task_type IN ('agent_task', 'public_expert_task'));

ALTER TABLE service_quote DROP CONSTRAINT service_quote_status_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_status_check
    CHECK (status IN ('active', 'accepted', 'superseded', 'revoked', 'expired'));

ALTER TABLE service_quote ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE service_quote ALTER COLUMN source_task_id SET NOT NULL;

ALTER TABLE service_quote DROP COLUMN proposal_id;
