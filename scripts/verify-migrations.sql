-- ==========================================================================
-- Read-only migration verification, for environments that only have psql.
--
--   psql "$DATABASE_URL" -X -f scripts/verify-migrations.sql
--
-- Complements scripts/verify-migrations.sh: the shell script also knows the
-- migration file tree and can run the migration runner for the authoritative
-- verdict. This file is what you paste onto a production box where you would
-- rather not copy a script around.
--
-- Every statement is a SELECT. Nothing here writes, locks or migrates.
--
-- What this CANNOT catch: checksum drift, i.e. an applied .up.sql whose bytes
-- were later edited. Only the runner can (it pins each file's SHA-256). Run
-- `./bin/aurocreator-migrate up` for that -- with migrations already applied
-- it is a no-op that only reports.
-- ==========================================================================

\pset pager off

\echo ''
\echo '=== L1  recorded state ==========================================='

\echo '--- row count and status spread (want: everything succeeded) ---'
SELECT status, count(*) AS rows
FROM schema_migrations
GROUP BY 1
ORDER BY 1;

\echo '--- rows that are NOT succeeded (want: zero rows) ---'
SELECT version, status, left(coalesce(error_text, ''), 100) AS error
FROM schema_migrations
WHERE status <> 'succeeded'
ORDER BY version;

\echo '--- newest 5 recorded versions ---'
SELECT version, status, completed_at
FROM schema_migrations
ORDER BY version DESC
LIMIT 5;

\echo ''
\echo '=== L2  effective schema ========================================='

\echo '--- INVALID indexes (want: zero rows) ---'
\echo '    An interrupted CREATE INDEX CONCURRENTLY leaves these behind while'
\echo '    the version row can still read succeeded. Fix: REINDEX INDEX CONCURRENTLY <name>.'
SELECT c.relname AS invalid_index, n.nspname AS schema
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT i.indisvalid
  AND n.nspname NOT IN ('pg_catalog', 'pg_toast')
ORDER BY 1;

\echo '--- NOT VALID CHECK constraints (informational, NOT a failure) ---'
\echo '    This repo intentionally adds CHECKs with NOT VALID to avoid a full'
\echo '    table scan during an incremental upgrade; these may stay unvalidated.'
SELECT conrelid::regclass AS table_name, conname
FROM pg_constraint
WHERE NOT convalidated
  AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

\echo '--- key business objects (want: all true) ---'
SELECT probe, ok, detail FROM (
    SELECT 'workspace table' AS probe,
           to_regclass('public.workspace') IS NOT NULL AS ok,
           'workspace identity' AS detail
  UNION ALL
    SELECT 'issue table', to_regclass('public.issue') IS NOT NULL,
           'shared tasks'
  UNION ALL
    SELECT 'chat_session table', to_regclass('public.chat_session') IS NOT NULL,
           'agent and direct conversations'
  UNION ALL
    SELECT 'workspace_openagent_config table',
           to_regclass('public.workspace_openagent_config') IS NOT NULL,
           'workspace-owned execution configuration'
  UNION ALL
    SELECT 'user_password table', to_regclass('public.user_password') IS NOT NULL,
           'password authentication'
  UNION ALL
    SELECT 'chat_message sequence index',
           EXISTS (SELECT 1 FROM pg_indexes
             WHERE schemaname='public' AND tablename='chat_message'
               AND indexname='idx_chat_message_sequence'),
           'one message per direct conversation sequence'
) probes
ORDER BY probe;

\echo ''
\echo '=== Verdict ======================================================'
\echo 'If L1 shows anything other than succeeded, or L2 shows an invalid'
\echo 'index, or any key object is false, this database is NOT fully migrated.'
\echo 'Remedy: cd server && ./bin/aurocreator-migrate up'
\echo ''
\echo 'Then confirm with the authoritative runner, which also rejects edited'
\echo 'migration files: cd server && ./bin/aurocreator-migrate up'
\echo ''
