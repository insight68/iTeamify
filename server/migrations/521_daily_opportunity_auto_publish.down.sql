ALTER TABLE daily_opportunity_edition
    DROP CONSTRAINT IF EXISTS chk_daily_opportunity_edition_publisher;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM daily_opportunity_edition
        WHERE status = 'published' AND publish_actor_type = 'system'
    ) THEN
        RAISE EXCEPTION 'cannot downgrade while system-published daily opportunity editions exist';
    END IF;
END $$;

ALTER TABLE daily_opportunity_edition
    DROP COLUMN publish_actor_type,
    ADD CONSTRAINT chk_daily_opportunity_edition_published_user
        CHECK (status <> 'published' OR (published_at IS NOT NULL AND published_by_user_id IS NOT NULL));

ALTER TABLE daily_opportunity_candidate
    DROP CONSTRAINT IF EXISTS chk_daily_opportunity_candidate_verification,
    DROP COLUMN verified_at,
    DROP COLUMN verified_payload_hash,
    DROP COLUMN verification_method_version;
