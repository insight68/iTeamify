#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create .env from .env.example, or run 'make worktree-env' and use .env.worktree."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

POSTGRES_DB="${POSTGRES_DB:-iteamify}"
POSTGRES_USER="${POSTGRES_USER:-iteamify}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-iteamify}"
DATABASE_URL="${DATABASE_URL:-}"

export PGPASSWORD="$POSTGRES_PASSWORD"
export PGCONNECT_TIMEOUT=5

db_host=""
db_user=""
db_port="${POSTGRES_PORT:-5432}"
db_name="$POSTGRES_DB"

parse_database_url() {
  local rest authority hostport path port_part

  rest="${DATABASE_URL#*://}"
  rest="${rest%%\?*}"
  authority="${rest%%/*}"
  path="${rest#*/}"

  if [ "$authority" = "$rest" ]; then
    path=""
  fi

  hostport="${authority##*@}"
  userinfo="${authority%%@*}"
  if [ "$userinfo" != "$authority" ] && [ -n "$userinfo" ]; then
    db_user="${userinfo%%:*}"
  fi

  if [[ "$hostport" == \[* ]]; then
    db_host="${hostport#\[}"
    db_host="${db_host%%]*}"
    port_part="${hostport#*\]}"
    if [[ "$port_part" == :* ]] && [ -n "${port_part#:}" ]; then
      db_port="${port_part#:}"
    fi
  else
    db_host="${hostport%%:*}"
    if [[ "$hostport" == *:* ]] && [ -n "${hostport##*:}" ]; then
      db_port="${hostport##*:}"
    fi
  fi

  if [ -n "$path" ]; then
    db_name="${path%%/*}"
  fi
}

if [ -n "$DATABASE_URL" ]; then
  parse_database_url
fi
if ! [[ "$db_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$ ]]; then
  echo "Unsupported database identifier; use letters, digits and underscores." >&2
  exit 1
fi

is_local() {
  [ -z "$DATABASE_URL" ] || [ "$db_host" = "localhost" ] || [ "$db_host" = "127.0.0.1" ] || [ "$db_host" = "::1" ]
}

if is_local; then
  check_host="${db_host:-localhost}"

  if command -v pg_isready > /dev/null 2>&1 && pg_isready -h "$check_host" -p "$db_port" -q > /dev/null 2>&1; then
    # ---------- Local: PostgreSQL already running (native install), skip Docker ----------
    echo "==> PostgreSQL already running at ${check_host}:${db_port}. Skipping Docker."
    check_user="${db_user:-$POSTGRES_USER}"
    if db_exists="$(psql -h "$check_host" -p "$db_port" -U "$check_user" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$db_name'" 2>/dev/null)"; then
      if [ "$db_exists" != "1" ]; then
        echo "==> Ensuring database '$db_name' exists..."
        psql -h "$check_host" -p "$db_port" -U "$check_user" -d postgres -v ON_ERROR_STOP=1 \
          -c "CREATE DATABASE \"$db_name\"" \
          > /dev/null
      fi
    else
      echo "Cannot authenticate as '$check_user' to $check_host:$db_port. PostgreSQL readiness alone is insufficient." >&2
      exit 1
    fi
    psql -h "$check_host" -p "$db_port" -U "$check_user" -d "$db_name" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT 1' > /dev/null
    echo "✓ PostgreSQL ready (local native). Database: $db_name"
  else
  # ---------- Local: use Docker ----------
  echo "==> Ensuring shared PostgreSQL container is running on localhost:5432..."
  command -v docker >/dev/null 2>&1 || { echo "PostgreSQL is unavailable; install/start PostgreSQL or Docker." >&2; exit 1; }
  docker compose up -d postgres

  echo "==> Waiting for PostgreSQL to be ready..."
  attempts=0
  until docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d postgres > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ "$attempts" -lt 60 ] || { echo "PostgreSQL startup timed out." >&2; exit 1; }
    sleep 1
  done

  echo "==> Ensuring database '$POSTGRES_DB' exists..."
  db_exists="$(docker compose exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'")"

  if [ "$db_exists" != "1" ]; then
    docker compose exec -T postgres \
      psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE \"$POSTGRES_DB\"" \
      > /dev/null
  fi

  echo "✓ PostgreSQL ready (local Docker). Database: $POSTGRES_DB"
  fi
else
  # ---------- Remote: skip Docker, verify connectivity ----------
  echo "==> Remote database detected (host: $db_host). Skipping Docker."
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT 1' > /dev/null
  echo "✓ PostgreSQL authenticated (remote: $db_host:$db_port). Database: $db_name"
fi
