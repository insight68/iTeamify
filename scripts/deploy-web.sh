#!/usr/bin/env bash
set -euo pipefail

# Deploy Teamify web to Vercel.
#
# Usage:
#   ./deploy-web.sh              # Production deploy
#   ./deploy-web.sh --preview    # Preview deploy
#   ./deploy-web.sh --help

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PREVIEW=false

for arg in "${@:-}"; do
  case "$arg" in
    --preview) PREVIEW=true ;;
    --help|-h)
      echo "Usage: deploy-web.sh [--preview|--help]"
      echo "  --preview  Deploy to Vercel preview (not production)"
      echo "  --help     Show this help"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# ---------- Check Vercel CLI ----------
if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI not found."
  echo "Install with:  pnpm add -g vercel"
  echo "Then run:      vercel login"
  exit 1
fi

# ---------- Deploy ----------
if [ "$PREVIEW" = true ]; then
  echo "==> Deploying to Vercel (preview)..."
  vercel
else
  echo "==> Deploying to Vercel (production)..."
  vercel --prod
fi
