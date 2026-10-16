ALTER TABLE service_order DROP COLUMN lead_id;
ALTER TABLE service_quote DROP COLUMN lead_id;

DROP TABLE lead_activities;
DROP TABLE lead_sources;
DROP TABLE lead_identities;
DROP TABLE lead_contacts;

ALTER TABLE leads
    DROP CONSTRAINT leads_custom_fields_check,
    DROP CONSTRAINT leads_tags_check,
    DROP CONSTRAINT leads_version_check,
    DROP CONSTRAINT leads_intent_score_check,
    DROP CONSTRAINT leads_quality_score_check,
    DROP CONSTRAINT leads_lifecycle_stage_check,
    DROP COLUMN updated_at,
    DROP COLUMN version,
    DROP COLUMN merged_into_lead_id,
    DROP COLUMN next_follow_up_at,
    DROP COLUMN last_contact_at,
    DROP COLUMN first_contact_at,
    DROP COLUMN custom_fields,
    DROP COLUMN tags,
    DROP COLUMN notes,
    DROP COLUMN intent_score,
    DROP COLUMN priority,
    DROP COLUMN owner_member_id,
    DROP COLUMN record_status,
    DROP COLUMN region,
    DROP COLUMN city,
    DROP COLUMN industry,
    DROP COLUMN website_url,
    DROP COLUMN display_name,
    DROP COLUMN lead_type;

ALTER TABLE leads RENAME COLUMN lifecycle_stage TO status;
ALTER TABLE leads ALTER COLUMN dedup_key SET NOT NULL;
ALTER TABLE leads ALTER COLUMN job_id SET NOT NULL;
ALTER TABLE leads ADD CONSTRAINT prospect_leads_market_language_check
    CHECK (market_language IN ('en', 'es', 'pt'));
