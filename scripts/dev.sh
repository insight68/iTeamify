#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- Check prerequisites ----------
missing=()
command -v node >/dev/null 2>&1 || missing+=("node")
command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")

if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ Missing prerequisites: ${missing[*]}"
  echo "  Please install: Node.js v20+, pnpm v10.28+"
  exit 1
fi

# ---------- Environment file ----------
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Creating $ENV_FILE from .env.example..."
  cp .env.example "$ENV_FILE"
fi

echo "==> Using $ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# ---------- Install dependencies ----------
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  pnpm install
fi

# ---------- Start frontend ----------
echo ""
echo "✓ Ready. Starting frontend..."
echo "  Frontend: http://localhost:${FRONTEND_PORT:-3000}"
if [ -n "${REMOTE_API_URL:-}" ]; then
  echo "  Backend:  ${REMOTE_API_URL}"
else
  echo "  Backend:  http://localhost:8080 (default, set REMOTE_API_URL to override)"
fi
echo ""

pnpm dev:web
