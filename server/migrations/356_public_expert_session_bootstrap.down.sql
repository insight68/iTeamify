ALTER TABLE public_expert_session
    DROP CONSTRAINT IF EXISTS public_expert_session_bootstrap_consistency,
    DROP COLUMN IF EXISTS bootstrap_expires_at,
    DROP COLUMN IF EXISTS bootstrap_payload_hash,
    DROP COLUMN IF EXISTS bootstrap_token_hash,
    DROP COLUMN IF EXISTS initial_client_message_id;
