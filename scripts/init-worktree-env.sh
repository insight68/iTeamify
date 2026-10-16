#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.worktree}"

if [ -f "$ENV_FILE" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "Refusing to overwrite existing $ENV_FILE. Re-run with FORCE=1 if you want to regenerate it."
  exit 1
fi

worktree_name="${WORKTREE_NAME:-$(basename "$PWD")}"
slug="$(printf '%s' "$worktree_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g; s/__*/_/g; s/^_//; s/_$//')"
if [ -z "$slug" ]; then
  slug="iteamify"
fi

hash_value="$(printf '%s' "$PWD" | cksum | awk '{print $1}')"
offset=$((hash_value % 1000))

postgres_db="iteamify_${slug}_${offset}"
postgres_port=5432
backend_port=$((8080 + offset))
frontend_port=$((3000 + offset))
frontend_origin="http://localhost:${frontend_port}"

cat > "$ENV_FILE" <<EOF
POSTGRES_DB=${postgres_db}
POSTGRES_USER=iteamify
POSTGRES_PASSWORD=iteamify
POSTGRES_PORT=${postgres_port}
DATABASE_URL=postgres://iteamify:iteamify@localhost:${postgres_port}/${postgres_db}?sslmode=disable

PORT=${backend_port}
JWT_SECRET=change-me-in-production
ITEAMIFY_DEV_VERIFICATION_CODE=888888
ITEAMIFY_SERVER_URL=ws://localhost:${backend_port}/ws
ITEAMIFY_APP_URL=${frontend_origin}

COMPOSIO_API_KEY=
COMPOSIO_STATE_SECRET=
COMPOSIO_CALLBACK_BASE_URL=${frontend_origin}

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=${frontend_origin}/auth/callback

GOOGLE_GMAIL_CLIENT_ID=
GOOGLE_GMAIL_CLIENT_SECRET=
ITEAMIFY_GMAIL_CALLBACK_BASE_URL=http://localhost:${backend_port}
ITEAMIFY_GMAIL_SECRET_KEY=
ITEAMIFY_GMAIL_PUBSUB_TOPIC=
ITEAMIFY_GMAIL_PUSH_AUDIENCE=
ITEAMIFY_GMAIL_PUSH_SERVICE_ACCOUNT=
ITEAMIFY_GMAIL_PUSH_TOKEN=

FRONTEND_PORT=${frontend_port}
FRONTEND_ORIGIN=${frontend_origin}
NEXT_PUBLIC_API_URL=http://localhost:${backend_port}
NEXT_PUBLIC_WS_URL=ws://localhost:${backend_port}/ws
EOF

echo "Generated $ENV_FILE for worktree '$worktree_name'"
echo "  Shared Postgres: localhost:${postgres_port}"
echo "  Database: ${postgres_db}"
echo "  Backend:  http://localhost:${backend_port}"
echo "  Frontend: ${frontend_origin}"
echo ""
echo "Next steps:"
echo "  make setup-worktree"
echo "  make start-worktree"
