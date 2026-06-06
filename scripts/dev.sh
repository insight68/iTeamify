#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

APP="${1:-web}"

usage() {
  echo "Usage: dev.sh [web|desktop|mobile]"
  echo "  web      Start Next.js dev server (default)"
  echo "  desktop  Start Electron dev server"
  echo "  mobile   Start React Native / Expo dev server"
  exit 1
}

# ---------- Check prerequisites ----------
missing=()
command -v node >/dev/null 2>&1 || missing+=("node")
command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")

if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing prerequisites: ${missing[*]}"
  echo "  Please install: Node.js v22+, pnpm v10.28+"
  exit 1
fi

# ---------- Environment file ----------
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f ".env.example" ]; then
    echo "==> Creating $ENV_FILE from .env.example..."
    cp .env.example "$ENV_FILE"
  else
    echo "Warning: No .env or .env.example found. Some features may not work."
  fi
fi

echo "==> Using $ENV_FILE"

set -a
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

# ---------- Install dependencies ----------
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  pnpm install
fi

# ---------- Dispatch to app ----------
case "$APP" in
  web)
    echo ""
    echo "Starting web dev server..."
    echo "  Frontend: http://localhost:${FRONTEND_PORT:-3000}"
    if [ -n "${REMOTE_API_URL:-}" ]; then
      echo "  Backend:  ${REMOTE_API_URL}"
    else
      echo "  Backend:  http://localhost:8080 (default, set REMOTE_API_URL to override)"
    fi
    echo ""
    pnpm dev:web
    ;;
  desktop)
    echo ""
    echo "Starting desktop dev server..."
    echo ""
    pnpm dev:desktop
    ;;
  mobile)
    # Ensure mobile .env exists
    MOBILE_ENV="apps/mobile/.env"
    if [ ! -f "$MOBILE_ENV" ] && [ -f "apps/mobile/.env.example" ]; then
      echo "==> Creating $MOBILE_ENV from .env.example..."
      cp "apps/mobile/.env.example" "$MOBILE_ENV"
    fi
    echo ""
    echo "Starting mobile dev server..."
    echo ""
    pnpm dev:mobile
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown app: $APP"
    usage
    ;;
esac
