-- Seed the Company draft from legacy workspace identity fields. Nothing is
-- published automatically: owners still review and explicitly publish the
-- resulting draft before production agents may use it.
INSERT INTO business_context (
    workspace_id,
    draft_revision,
    draft_content,
    created_at,
    updated_at
)
SELECT
    w.id,
    1,
    jsonb_build_object(
        'business_name', w.name,
        'website_url', '',
        'summary', COALESCE(w.description, ''),
        'positioning', '',
        'differentiators', jsonb_build_array(),
        'principles', jsonb_build_array(),
        'exclusions', jsonb_build_array(),
        'offers', jsonb_build_array(),
        'audiences', jsonb_build_array(),
        'proof', jsonb_build_array(),
        'sources', CASE
            WHEN NULLIF(btrim(COALESCE(w.context, '')), '') IS NULL
                THEN jsonb_build_array()
            ELSE jsonb_build_array(jsonb_build_object(
                'id', '00000000-0000-0000-0000-000000000001',
                'title', 'Imported workspace context — review required',
                'url', '',
                'notes', w.context
            ))
        END
    ),
    now(),
    now()
FROM workspace w
WHERE NOT EXISTS (
    SELECT 1 FROM business_context bc WHERE bc.workspace_id = w.id
);

-- Existing drafts keep every established fact. Fill only blank identity
-- fields and append the legacy free-text context once as an explicitly
-- unverified source. Bump the revision so stale AI proposals cannot apply.
WITH candidates AS (
    SELECT
        bc.id,
        bc.workspace_id,
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    bc.draft_content,
                    '{business_name}',
                    CASE
                        WHEN btrim(COALESCE(bc.draft_content->>'business_name', '')) = ''
                            THEN to_jsonb(w.name)
                        ELSE bc.draft_content->'business_name'
                    END,
                    true
                ),
                '{summary}',
                CASE
                    WHEN btrim(COALESCE(bc.draft_content->>'summary', '')) = ''
                         AND NULLIF(btrim(COALESCE(w.description, '')), '') IS NOT NULL
                        THEN to_jsonb(w.description)
                    ELSE COALESCE(bc.draft_content->'summary', to_jsonb(''::text))
                END,
                true
            ),
            '{sources}',
            CASE
                WHEN NULLIF(btrim(COALESCE(w.context, '')), '') IS NOT NULL
                     AND NOT EXISTS (
                         SELECT 1
                         FROM jsonb_array_elements(
                             CASE
                                 WHEN jsonb_typeof(bc.draft_content->'sources') = 'array'
                                     THEN bc.draft_content->'sources'
                                 ELSE '[]'::jsonb
                             END
                         ) source
                         WHERE source->>'id' = '00000000-0000-0000-0000-000000000001'
                     )
                    THEN CASE
                             WHEN jsonb_typeof(bc.draft_content->'sources') = 'array'
                                 THEN bc.draft_content->'sources'
                             ELSE '[]'::jsonb
                         END
                         || jsonb_build_array(jsonb_build_object(
                             'id', '00000000-0000-0000-0000-000000000001',
                             'title', 'Imported workspace context — review required',
                             'url', '',
                             'notes', w.context
                         ))
                ELSE CASE
                         WHEN jsonb_typeof(bc.draft_content->'sources') = 'array'
                             THEN bc.draft_content->'sources'
                         ELSE '[]'::jsonb
                     END
            END,
            true
        ) AS next_content
    FROM business_context bc
    JOIN workspace w ON w.id = bc.workspace_id
), updated AS (
    UPDATE business_context bc
    SET draft_content = candidates.next_content,
        draft_revision = bc.draft_revision + 1,
        updated_at = now()
    FROM candidates
    WHERE bc.id = candidates.id
      AND bc.draft_content IS DISTINCT FROM candidates.next_content
    RETURNING bc.workspace_id, bc.draft_revision
)
UPDATE business_change_proposal proposal
SET status = 'stale', updated_at = now()
FROM updated
WHERE proposal.workspace_id = updated.workspace_id
  AND proposal.status = 'pending'
  AND proposal.base_revision <> updated.draft_revision;
