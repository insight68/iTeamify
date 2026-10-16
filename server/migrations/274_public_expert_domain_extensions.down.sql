DELETE FROM service_order WHERE conversation_type = 'public_expert';
DELETE FROM service_quote_item
WHERE quote_id IN (SELECT id FROM service_quote WHERE conversation_type = 'public_expert');
DELETE FROM service_quote WHERE conversation_type = 'public_expert';

ALTER TABLE service_order
    DROP CONSTRAINT IF EXISTS service_order_conversation_source_check,
    DROP CONSTRAINT IF EXISTS service_order_conversation_type_check,
    DROP COLUMN IF EXISTS page_release_id,
    DROP COLUMN IF EXISTS public_expert_session_id,
    DROP COLUMN IF EXISTS conversation_type,
    ALTER COLUMN chat_session_id SET NOT NULL;

ALTER TABLE service_quote
    DROP CONSTRAINT IF EXISTS service_quote_conversation_source_check,
    DROP CONSTRAINT IF EXISTS service_quote_action_payload_hash_check,
    DROP CONSTRAINT IF EXISTS service_quote_action_key_check,
    DROP CONSTRAINT IF EXISTS service_quote_public_ref_check,
    DROP CONSTRAINT IF EXISTS service_quote_pricing_audit_check,
    DROP CONSTRAINT IF EXISTS service_quote_discount_bps_check,
    DROP CONSTRAINT IF EXISTS service_quote_revision_check,
    DROP CONSTRAINT IF EXISTS service_quote_source_task_type_check,
    DROP CONSTRAINT IF EXISTS service_quote_conversation_type_check,
    DROP COLUMN IF EXISTS pricing_audit,
    DROP COLUMN IF EXISTS discount_bps,
    DROP COLUMN IF EXISTS action_payload_hash,
    DROP COLUMN IF EXISTS action_key,
    DROP COLUMN IF EXISTS revision,
    DROP COLUMN IF EXISTS public_ref,
    DROP COLUMN IF EXISTS source_task_type,
    DROP COLUMN IF EXISTS page_release_id,
    DROP COLUMN IF EXISTS public_expert_session_id,
    DROP COLUMN IF EXISTS conversation_type,
    ALTER COLUMN chat_session_id SET NOT NULL;

DELETE FROM lead_sources WHERE source_type = 'public_expert';
ALTER TABLE lead_sources
    DROP CONSTRAINT IF EXISTS lead_sources_source_type_check,
    DROP COLUMN IF EXISTS public_expert_session_id,
    ADD CONSTRAINT lead_sources_source_type_check
        CHECK (source_type IN ('lead_mining', 'chat', 'manual', 'quote', 'import', 'api'));

DELETE FROM lead_activities
WHERE activity_type IN ('contact_captured', 'quote_sent', 'follow_up_requested');
ALTER TABLE lead_activities
    DROP CONSTRAINT IF EXISTS lead_activities_activity_type_check,
    DROP COLUMN IF EXISTS public_expert_session_id,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN ('created', 'updated', 'note', 'stage_changed', 'quote_accepted'));

ALTER TABLE inbox_item
    DROP CONSTRAINT IF EXISTS inbox_item_event_key_check,
    DROP COLUMN IF EXISTS event_key;
