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
\echo '    table lock (see migrations/413) and never validates them afterwards.'
SELECT conrelid::regclass AS table_name, conname
FROM pg_constraint
WHERE NOT convalidated
  AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

\echo '--- key business objects (want: all true) ---'
\echo '    Indexes are built with CREATE [UNIQUE] INDEX CONCURRENTLY by repo'
\echo '    policy, so they live in pg_indexes, NOT pg_constraint. Looking for'
\echo '    uq_service_quote_proposal_current in pg_constraint finds nothing'
\echo '    even on a perfectly healthy database.'
SELECT probe, ok, detail FROM (
    SELECT 'service_proposal table' AS probe,
           (to_regclass('public.service_proposal') IS NOT NULL) AS ok,
           coalesce(to_regclass('public.service_proposal')::text, 'missing') AS detail
  UNION ALL
    SELECT 'service_quote.proposal_id column',
           (SELECT count(*) = 1 FROM information_schema.columns
             WHERE table_name = 'service_quote' AND column_name = 'proposal_id'),
           'links a CRM quote to its proposal'
  UNION ALL
    SELECT 'service_quote.expires_at column',
           (SELECT count(*) = 1 FROM information_schema.columns
             WHERE table_name = 'service_quote' AND column_name = 'expires_at'),
           'draft quotes may legitimately have no expiry'
  UNION ALL
    SELECT 'uq_service_quote_proposal_current index',
           (SELECT count(*) = 1 FROM pg_indexes
             WHERE tablename = 'service_quote'
               AND indexname = 'uq_service_quote_proposal_current'),
           'exactly one live quote per proposal'
  UNION ALL
    SELECT 'service_quote status allows draft',
           (SELECT EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'service_quote_status_check'
               AND pg_get_constraintdef(oid) ILIKE '%draft%')),
           'an unpriced draft must be legal'
  UNION ALL
    SELECT 'service_order accepts crm source',
           (SELECT count(*) > 0 FROM pg_constraint
             WHERE conrelid = 'service_order'::regclass
               AND pg_get_constraintdef(oid) ILIKE '%crm%'),
           'order source enum includes crm'
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
