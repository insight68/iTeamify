UPDATE leads
SET display_name = COALESCE(NULLIF(btrim(company_name), ''), NULLIF(btrim(domain), ''), 'Unknown lead'),
    updated_at = now()
WHERE display_name = '';

INSERT INTO lead_identities (workspace_id, lead_id, identity_type, normalized_value)
SELECT workspace_id, id, 'domain', lower(regexp_replace(regexp_replace(btrim(domain), '^https?://', ''), '^www\\.', ''))
FROM leads
WHERE domain IS NOT NULL
  AND btrim(domain) <> ''
ON CONFLICT (workspace_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO lead_identities (workspace_id, lead_id, identity_type, normalized_value)
SELECT l.workspace_id, l.id, 'email', lower(btrim(email.value))
FROM leads l
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.emails, '[]'::jsonb)) AS entry(value)
CROSS JOIN LATERAL (
    VALUES (
        CASE jsonb_typeof(entry.value)
            WHEN 'string' THEN entry.value #>> '{}'
            WHEN 'object' THEN COALESCE(entry.value ->> 'email', entry.value ->> 'value')
        END
    )
) AS email(value)
WHERE email.value IS NOT NULL
  AND btrim(email.value) <> ''
ON CONFLICT (workspace_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO lead_identities (workspace_id, lead_id, identity_type, normalized_value)
SELECT l.workspace_id, l.id, 'phone', regexp_replace(btrim(phone.value), '[ ()-]', '', 'g')
FROM leads l
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.phones, '[]'::jsonb)) AS entry(value)
CROSS JOIN LATERAL (
    VALUES (
        CASE jsonb_typeof(entry.value)
            WHEN 'string' THEN entry.value #>> '{}'
            WHEN 'object' THEN COALESCE(entry.value ->> 'phone', entry.value ->> 'value')
        END
    )
) AS phone(value)
WHERE phone.value IS NOT NULL
  AND btrim(phone.value) <> ''
ON CONFLICT (workspace_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO lead_identities (workspace_id, lead_id, identity_type, normalized_value)
SELECT workspace_id, id, 'linkedin', lower(rtrim(btrim(linkedin_url), '/'))
FROM leads
WHERE linkedin_url IS NOT NULL
  AND btrim(linkedin_url) <> ''
ON CONFLICT (workspace_id, identity_type, normalized_value) DO NOTHING;

INSERT INTO lead_sources (
    workspace_id, lead_id, source_type, source_key, lead_mining_job_id, summary
)
SELECT workspace_id, id, 'lead_mining', 'legacy-lead-mining:' || id::text, job_id, company_name
FROM leads
WHERE job_id IS NOT NULL
ON CONFLICT (workspace_id, source_type, source_key) DO NOTHING;
