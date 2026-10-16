-- Fail fast before the public /experts/{workspaceSlug} route is enabled when
-- an existing workspace already owns the newly-reserved `experts` slug.
-- Silently keeping such a row would route /experts/* to the public expert
-- surface instead of the existing workspace. The operator must choose and
-- communicate the replacement slug before retrying the deployment.
--
-- Keep this audit aligned with:
--  - server/internal/handler/reserved_slugs.json
--  - packages/core/paths/reserved-slugs.ts

DO $$
DECLARE
  conflict_count INT;
  conflict_list TEXT;
BEGIN
  SELECT
    COUNT(*),
    string_agg(id::text || ':' || slug, ', ' ORDER BY id::text)
  INTO conflict_count, conflict_list
  FROM workspace
  WHERE slug = 'experts';

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Found % workspace(s) using newly-reserved slug `experts`: %. Rename them before deploying the public experts route.', conflict_count, conflict_list;
  END IF;
END $$;
