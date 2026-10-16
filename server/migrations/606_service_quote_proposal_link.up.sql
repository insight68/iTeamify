-- Let a service_quote originate from a CRM proposal instead of a conversation.
--
-- Before this migration every quote was produced by a conversation. That is
-- encoded in two NOT NULL columns (source_task_id, expires_at) and, more
-- strictly, in service_quote_conversation_source_check, which only admits
-- 'internal_chat' and 'public_expert'. A CRM quote has neither a chat session
-- nor a public expert session, so no row could satisfy that CHECK. Adding a
-- third conversation_type is what actually opens the gate; the column
-- relaxations below only make the row storable.
--
-- Amount and validity handling, deliberately:
--   * subtotal_minor / total_minor stay NOT NULL. Widening them to NULL would
--     regenerate db.ServiceQuote.SubtotalMinor as pgtype.Int8 and change every
--     reader of a quote amount. A draft instead stores 0, and 0 is a faithful
--     sentinel rather than an approximation: service_quote_item forbids
--     line_total_minor <= 0, so subtotal_minor = 0 means exactly "no priced
--     items yet" and can never mean "free".
--   * expires_at becomes nullable because that column is already
--     pgtype.Timestamptz on the Go side, so relaxing it costs nothing, and a
--     draft genuinely has no validity window until it is sent.
--   * service_quote_priced_check then re-tightens both for every non-draft
--     status, so the loosening cannot leak into a customer-visible quote.

ALTER TABLE service_quote ADD COLUMN proposal_id UUID;

ALTER TABLE service_quote ALTER COLUMN source_task_id DROP NOT NULL;
ALTER TABLE service_quote ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE service_quote DROP CONSTRAINT service_quote_status_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_status_check
    CHECK (status IN ('draft', 'active', 'accepted', 'superseded', 'revoked', 'expired'));

ALTER TABLE service_quote DROP CONSTRAINT service_quote_source_task_type_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_source_task_type_check
    CHECK (source_task_type IN ('agent_task', 'public_expert_task', 'crm'));

ALTER TABLE service_quote DROP CONSTRAINT service_quote_subtotal_minor_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_subtotal_minor_check
    CHECK (subtotal_minor >= 0);

ALTER TABLE service_quote DROP CONSTRAINT service_quote_total_minor_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_total_minor_check
    CHECK (total_minor >= 0);

ALTER TABLE service_quote DROP CONSTRAINT service_quote_conversation_type_check;
ALTER TABLE service_quote ADD CONSTRAINT service_quote_conversation_type_check
    CHECK (conversation_type IN ('internal_chat', 'public_expert', 'crm'));

-- The internal_chat and public_expert branches are reproduced verbatim from
-- their original definition; only the crm branch is new. Rebuilding the
-- constraint is unavoidable because a CHECK cannot be extended in place, so it
-- is reproduced rather than rewritten.
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
        OR (
            conversation_type = 'crm'
            AND chat_session_id IS NULL
            AND public_expert_session_id IS NULL
            AND page_release_id IS NULL
            AND source_task_type = 'crm'
            AND source_task_id IS NULL
            AND public_ref IS NULL
            AND action_key IS NULL
            AND action_payload_hash IS NULL
            AND discount_bps IS NULL
        )
    );

-- Only a draft may be unpriced. Every predicate below resolves to a definite
-- boolean: subtotal_minor and total_minor are NOT NULL, and expires_at is
-- tested with IS NOT NULL, so nothing here can evaluate to NULL and be waved
-- through by CHECK's NULL-is-pass rule.
ALTER TABLE service_quote ADD CONSTRAINT service_quote_priced_check
    CHECK (
        status = 'draft'
        OR (
            subtotal_minor > 0
            AND total_minor > 0
            AND expires_at IS NOT NULL
        )
    );
