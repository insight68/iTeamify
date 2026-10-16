ALTER TABLE public_quote_contact_verification
    DROP CONSTRAINT IF EXISTS public_quote_verification_delivery_attempts_valid,
    DROP COLUMN IF EXISTS last_delivery_attempt_at,
    DROP COLUMN IF EXISTS max_delivery_attempts,
    DROP COLUMN IF EXISTS delivery_attempt_count;
