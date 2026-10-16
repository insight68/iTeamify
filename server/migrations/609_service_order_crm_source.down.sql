ALTER TABLE service_order DROP CONSTRAINT service_order_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_check
    CHECK (
        (buyer_type = 'user' AND buyer_user_id IS NOT NULL)
        OR (buyer_type = 'guest' AND buyer_user_id IS NULL)
    );

ALTER TABLE service_order DROP CONSTRAINT service_order_buyer_type_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_buyer_type_check
    CHECK (buyer_type IN ('user', 'guest'));

ALTER TABLE service_order DROP CONSTRAINT service_order_conversation_source_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_conversation_source_check
    CHECK (
        (
            conversation_type = 'internal_chat'
            AND chat_session_id IS NOT NULL
            AND public_expert_session_id IS NULL
            AND page_release_id IS NULL
        )
        OR (
            conversation_type = 'public_expert'
            AND chat_session_id IS NULL
            AND public_expert_session_id IS NOT NULL
            AND page_release_id IS NOT NULL
        )
    );

ALTER TABLE service_order DROP CONSTRAINT service_order_conversation_type_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_conversation_type_check
    CHECK (conversation_type IN ('internal_chat', 'public_expert'));
