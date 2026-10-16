#!/usr/bin/env bash
set -euo pipefail

# ==========================================================================
# Database migration verification.
#
# Answers exactly one question: is THIS database migrated all the way to the
# schema the checked-out code expects?
#
# Four layers, cheapest and least invasive first:
#
#   L0  App readiness     GET /readyz on the running backend. The app compares
#                         the migration set it was built with against the DB,
#                         requiring status='succeeded' AND checksum IS NOT NULL.
#                         That last clause catches a hand-inserted version row,
#                         which nothing else here does. One curl, on the box.
#
#   L1  Recorded state    schema_migrations rows only. Catches: dirty
#                         applying/failed rows, versions the runner knows
#                         about but the DB never applied, versions the DB
#                         recorded that no longer exist in the tree.
#
#   L2  Effective schema  What actually exists right now. Catches what the
#                         bookkeeping cannot: a CREATE INDEX CONCURRENTLY
#                         that was interrupted leaves an INVALID index while
#                         the version row can still look fine, and an object
#                         that was dropped by hand.
#
#   L3  Authoritative     Runs the migration runner itself. It pins every
#                         .up.sql SHA-256, refuses checksum drift, refuses
#                         unknown versions and refuses to proceed from a
#                         dirty state. This is the only verdict that catches
#                         an applied migration whose bytes were later edited.
#                         Gated behind --apply because it can write.
#
# Usage:
#   scripts/verify-migrations.sh                 # uses .env DATABASE_URL
#   scripts/verify-migrations.sh "<DATABASE_URL>"
#   scripts/verify-migrations.sh --apply [URL]   # + authoritative check
#   scripts/verify-migrations.sh --readyz <URL>  # probe another host
#   scripts/verify-migrations.sh --no-readyz     # skip L0
#
# Exit codes: 0 = verified, 1 = problem found, 2 = usage/environment error.
# ==========================================================================

APPLY=0
READYZ_URL="${READYZ_URL:-http://127.0.0.1:8080/readyz}"
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --readyz) shift; READYZ_URL="${1:-}" ;;
    --no-readyz) READYZ_URL="" ;;
    -h|--help) sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/server/migrations"

command -v psql >/dev/null 2>&1 || export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v psql >/dev/null 2>&1; then
  echo "✗ psql not found on PATH (install libpq / postgresql-client)" >&2
  exit 2
fi

DATABASE_URL="${POSITIONAL[0]:-${DATABASE_URL:-}}"
if [ -z "$DATABASE_URL" ] && [ -f "$ROOT/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
fi
if [ -z "$DATABASE_URL" ]; then
  echo "✗ No DATABASE_URL given and none found in .env" >&2
  exit 2
fi
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "✗ migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 2
fi

# Never echo the password back into a terminal or log.
SAFE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#(://[^:/@]+:)[^@]*@#\1***@#')"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -tA -F'|')

FAILURES=0
note() { printf '  ! %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

echo "=================================================================="
echo "Migration verification"
echo "  database:   $SAFE_URL"
echo "  migrations: $MIGRATIONS_DIR"
echo "=================================================================="

# --------------------------------------------------------------------------
# L0 — app readiness (fastest, and the only layer that catches a hand-inserted
# version row, because it requires checksum IS NOT NULL)
# --------------------------------------------------------------------------
echo
echo "L0  app readiness (/readyz)"
if [ -z "$READYZ_URL" ]; then
  note "disabled"
elif ! command -v curl >/dev/null 2>&1; then
  note "curl not available — skipped"
else
  BODY="$(curl -s --max-time 5 "$READYZ_URL" 2>/dev/null || true)"
  case "$BODY" in
    *'"migrations":"ok"'*)
      ok "app reports migrations ok  ($READYZ_URL)" ;;
    *'"migrations":"out_of_date"'*)
      bad "app reports migrations OUT OF DATE — at least one migration this build needs is missing, dirty, or has no pinned checksum" ;;
    *'"migrations":"error"'*)
      bad "app reports migrations ERROR — the binary could not resolve its own migration set" ;;
    *'"migrations":"unknown"'*)
      bad "app reports migrations UNKNOWN — the app cannot reach the database" ;;
    "")
      note "no response from $READYZ_URL (app not running here?) — skipped" ;;
    *)
      note "unexpected response: $(printf '%s' "$BODY" | head -c 120)" ;;
  esac
  note "readyz checks the build's full migration set and requires a pinned checksum;"
  note "it still cannot see checksum DRIFT or a dropped object — L2/L3 cover those."
fi

# --------------------------------------------------------------------------
# L1 — recorded state
# --------------------------------------------------------------------------
echo
echo "L1  recorded state (schema_migrations)"

if [ "$("${PSQL[@]}" -c "select to_regclass('public.schema_migrations') is not null;" 2>/dev/null)" != "t" ]; then
  # A database that has never been migrated and one that is merely behind look
  # the same from here, but the fix differs, so say which it is.
  bad "schema_migrations does not exist — this database has never been migrated"
  echo
  echo "Verdict: FAIL (run the migration runner: ./bin/aurocreator-migrate up)"
  exit 1
fi

TOTAL="$("${PSQL[@]}" -c "select count(*) from schema_migrations;")"
DIRTY="$("${PSQL[@]}" -c "select count(*) from schema_migrations where status <> 'succeeded';")"
ok "rows recorded: $TOTAL"

if [ "$DIRTY" != "0" ]; then
  bad "$DIRTY row(s) are not 'succeeded' — a previous run died mid-flight:"
  "${PSQL[@]}" -c "select '    ' || version || '  status=' || status || coalesce('  err=' || left(error_text, 80), '') from schema_migrations where status <> 'succeeded' order by version;"
else
  ok "all rows succeeded (no applying/failed residue)"
fi

ALL_LIST="$(mktemp)"
FILE_LIST="$(mktemp)"
DB_LIST="$(mktemp)"
UNTRACKED_LIST="$(mktemp)"
trap 'rm -f "$ALL_LIST" "$FILE_LIST" "$DB_LIST" "$UNTRACKED_LIST"' EXIT

(cd "$MIGRATIONS_DIR" && ls *.up.sql | sed 's/\.up\.sql$//' | LC_ALL=C sort) >"$ALL_LIST"

# Baseline = migrations COMMITTED to git, not everything sitting on disk.
# A deploy only ever ships committed files, so an untracked migration is not
# "missing" from a remote database -- it does not exist there yet, and
# reporting it would be a false alarm. This repo currently has several
# untracked migrations in flight, which is exactly how that false alarm shows
# up. Fall back to the directory when not in a git checkout (release tarball).
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$ROOT" ls-files -- server/migrations/ 2>/dev/null \
    | while IFS= read -r file; do
        if [ -f "$ROOT/$file" ]; then printf '%s\n' "$file"; fi
      done \
    | grep '\.up\.sql$' | sed 's#.*/##; s/\.up\.sql$//' | LC_ALL=C sort >"$FILE_LIST"
fi
if [ ! -s "$FILE_LIST" ]; then
  cp "$ALL_LIST" "$FILE_LIST"
fi
comm -13 "$FILE_LIST" "$ALL_LIST" >"$UNTRACKED_LIST"

"${PSQL[@]}" -c "select version from schema_migrations order by 1;" | LC_ALL=C sort >"$DB_LIST"

FILE_COUNT="$(wc -l <"$FILE_LIST" | tr -d ' ')"
MISSING="$(comm -23 "$FILE_LIST" "$DB_LIST")"
# Compared against EVERYTHING on disk, not just the committed baseline: a row
# recorded here but absent from the tree entirely means code was rolled back
# while the database kept the migration. Uncommitted files are still on disk,
# so they are correctly not "unknown".
UNKNOWN="$(comm -13 "$ALL_LIST" "$DB_LIST")"

if [ -n "$MISSING" ]; then
  bad "$(printf '%s\n' "$MISSING" | wc -l | tr -d ' ') committed migration(s) NOT applied to this database:"
  printf '%s\n' "$MISSING" | sed 's/^/      /' | head -20
  [ "$(printf '%s\n' "$MISSING" | wc -l | tr -d ' ')" -gt 20 ] && note "... and more"
else
  ok "every committed migration ($FILE_COUNT) is recorded as applied"
fi

if [ -s "$UNTRACKED_LIST" ]; then
  note "$(wc -l <"$UNTRACKED_LIST" | tr -d ' ') uncommitted migration file(s) in the working tree (not part of the baseline):"
  sed 's/^/      /' "$UNTRACKED_LIST" | head -10
  note "these cannot exist on a deployed database; commit them before comparing"
fi

if [ -n "$UNKNOWN" ]; then
  note "$(printf '%s\n' "$UNKNOWN" | wc -l | tr -d ' ') version(s) recorded here but absent from the baseline (rolled back code?):"
  printf '%s\n' "$UNKNOWN" | sed 's/^/      /' | head -10
fi

# --------------------------------------------------------------------------
# L2 — effective schema
# --------------------------------------------------------------------------
echo
echo "L2  effective schema (what actually exists)"

INVALID_IDX="$("${PSQL[@]}" -c "
  select c.relname
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not i.indisvalid and n.nspname not in ('pg_catalog', 'pg_toast')
  order by 1;")"
if [ -n "$INVALID_IDX" ]; then
  bad "INVALID index(es) — a CREATE INDEX CONCURRENTLY was interrupted:"
  printf '%s\n' "$INVALID_IDX" | sed 's/^/      /'
  note "the version row can still read 'succeeded'; rebuild each with REINDEX INDEX CONCURRENTLY"
else
  ok "no invalid indexes"
fi

# NOT VALID constraints are how this repo adds a CHECK without taking a full
# table scan during an incremental upgrade. They can stay unvalidated,
# so this is informational, never a failure.
NOTVALID="$("${PSQL[@]}" -c "
  select count(*) from pg_constraint
  where not convalidated and connamespace = 'public'::regnamespace;")"
if [ "$NOTVALID" != "0" ]; then
  note "$NOTVALID CHECK constraint(s) are NOT VALID (informational only)"
else
  ok "no unvalidated CHECK constraints"
fi

# Key business objects. Extend this list when a migration introduces something
# the product cannot start without. Each probe prints: name|ok|detail.
PROBES="$("${PSQL[@]}" -c "
  select 'workspace table' as probe, (to_regclass('public.workspace') is not null)::text as ok, coalesce(to_regclass('public.workspace')::text, 'missing') as detail
  union all select 'issue table', (to_regclass('public.issue') is not null)::text, coalesce(to_regclass('public.issue')::text, 'missing')
  order by 1;")"
while IFS='|' read -r name state detail; do
  [ -z "$name" ] && continue
  if [ "$state" = "true" ]; then ok "$name"; else bad "$name — $detail"; fi
done <<<"$PROBES"

# --------------------------------------------------------------------------
# L3 — authoritative (opt-in)
# --------------------------------------------------------------------------
echo
echo "L3  authoritative (migration runner)"
if [ "$APPLY" != "1" ]; then
  note "skipped — re-run with --apply to let the runner verify checksums and pending work"
  note "the runner is the only check a hand-edited schema_migrations row cannot fool"
else
  LOG="/tmp/verify-migrations-runner.log"
  RUNNER=""
  # Prefer the deployed runner name, then the dev build.
  if [ -x "$ROOT/server/bin/aurocreator-migrate" ]; then RUNNER="$ROOT/server/bin/aurocreator-migrate"
  elif [ -x "$ROOT/server/bin/migrate" ]; then RUNNER="$ROOT/server/bin/migrate"
  fi

  # The runner does NOT embed migrations: internal/migrations.ResolveDir walks
  # up from the CWD looking for migrations/ or server/migrations/. So the
  # working directory decides which migration set is compared, and running it
  # from the wrong place silently validates the wrong tree. Always cd first.
  run_runner() {
    ( cd "$ROOT/server" && DATABASE_URL="$DATABASE_URL" "$@" ) >"$LOG" 2>&1
  }

  if [ -n "$RUNNER" ]; then
    if run_runner "$RUNNER" up; then
      ok "runner accepted the database ($(grep -c '^  skip ' "$LOG" 2>/dev/null || true) skipped)"
      grep -E '^  apply ' "$LOG" 2>/dev/null | sed 's/^/      /' | head -10
    else
      bad "runner REFUSED the database (checksum drift / unknown version / dirty state)"
      tail -6 "$LOG" | sed 's/^/      /'
    fi
  elif command -v go >/dev/null 2>&1; then
    if run_runner go run ./cmd/migrate up; then
      ok "runner accepted the database ($(grep -c '^  skip ' "$LOG" 2>/dev/null || true) skipped)"
      grep -E '^  apply ' "$LOG" 2>/dev/null | sed 's/^/      /' | head -10
    else
      bad "runner REFUSED the database (checksum drift / unknown version / dirty state)"
      tail -6 "$LOG" | sed 's/^/      /'
    fi
  else
    note "no prebuilt runner and no go toolchain — cannot run L3"
  fi
fi

# --------------------------------------------------------------------------
echo
echo "=================================================================="
if [ "$FAILURES" -eq 0 ]; then
  echo "Verdict: PASS — schema matches the tree (L1+L2)"
  [ "$APPLY" != "1" ] && echo "         (L3 not run; add --apply for the authoritative verdict)"
  exit 0
fi
echo "Verdict: FAIL — $FAILURES problem(s) found above"
exit 1
