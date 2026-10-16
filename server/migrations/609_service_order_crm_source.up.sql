-- Let a service_order originate from a CRM proposal.
--
-- service_order_conversation_source_check requires either a chat session
-- (internal_chat) or a public expert session (public_expert). An order created
-- from a CRM proposal has neither, so it needs the same 'crm' branch that
-- migration 606 added to service_quote. Without it the accept path fails the
-- CHECK rather than returning anything the caller can act on.
--
-- buyer_type gains 'contact': the buyer is a known person at an account we
-- already hold, which is neither a platform user nor an anonymous guest. The
-- pairing CHECK is rewritten because it enumerates buyer_type explicitly;
-- 'contact' shares the guest shape (no platform user id) but must still carry
-- a reachable email or phone, which service_order_check1 already enforces.
-- Whether account_id is present is left to the application layer so a missing
-- account surfaces as a 4xx instead of a constraint violation.

ALTER TABLE service_order DROP CONSTRAINT service_order_conversation_type_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_conversation_type_check
    CHECK (conversation_type IN ('internal_chat', 'public_expert', 'crm'));

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
        OR (
            conversation_type = 'crm'
            AND chat_session_id IS NULL
            AND public_expert_session_id IS NULL
            AND page_release_id IS NULL
        )
    );

ALTER TABLE service_order DROP CONSTRAINT service_order_buyer_type_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_buyer_type_check
    CHECK (buyer_type IN ('user', 'guest', 'contact'));

ALTER TABLE service_order DROP CONSTRAINT service_order_check;
ALTER TABLE service_order ADD CONSTRAINT service_order_check
    CHECK (
        (buyer_type = 'user' AND buyer_user_id IS NOT NULL)
        OR (buyer_type IN ('guest', 'contact') AND buyer_user_id IS NULL)
    );
