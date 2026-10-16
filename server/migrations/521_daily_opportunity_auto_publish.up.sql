-- Seal machine verification to the exact candidate payload and distinguish
-- automated publication from human publication. Relationships stay soft.

ALTER TABLE daily_opportunity_candidate
    ADD COLUMN verification_method_version TEXT NOT NULL DEFAULT '',
    ADD COLUMN verified_payload_hash BYTEA,
    ADD COLUMN verified_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_daily_opportunity_candidate_verification
        CHECK (
            (verification_method_version = '' AND verified_payload_hash IS NULL AND verified_at IS NULL)
            OR (
                char_length(verification_method_version) BETWEEN 3 AND 80
                AND octet_length(verified_payload_hash) = 32
                AND verified_at IS NOT NULL
            )
        );

ALTER TABLE daily_opportunity_edition
    ADD COLUMN publish_actor_type TEXT NOT NULL DEFAULT 'user'
        CHECK (publish_actor_type IN ('user', 'system'));

DO $$
DECLARE
    current_constraint TEXT;
BEGIN
    SELECT conname
      INTO current_constraint
      FROM pg_constraint
     WHERE conrelid = 'daily_opportunity_edition'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%published_at IS NOT NULL%published_by_user_id IS NOT NULL%'
     LIMIT 1;

    IF current_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE daily_opportunity_edition DROP CONSTRAINT %I', current_constraint);
    END IF;
END $$;

ALTER TABLE daily_opportunity_edition
    ADD CONSTRAINT chk_daily_opportunity_edition_publisher
        CHECK (
            status <> 'published'
            OR (
                published_at IS NOT NULL
                AND (
                    (publish_actor_type = 'user' AND published_by_user_id IS NOT NULL)
                    OR (publish_actor_type = 'system' AND published_by_user_id IS NULL)
                )
            )
        );
