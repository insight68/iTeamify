#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

info() { printf "${BOLD}${CYAN}==> %s${RESET}\n" "$*"; }
ok()   { printf "${BOLD}${GREEN}✓ %s${RESET}\n" "$*"; }

# ---------- Check prerequisites ----------
missing=()
command -v node >/dev/null 2>&1 || missing+=("node")
command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")

if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing prerequisites: ${missing[*]}"
  echo "  Please install: Node.js v22+, pnpm v10.28+"
  exit 1
fi

info "Prerequisites OK (node=$(node -v), pnpm=$(pnpm -v))"

# ---------- Environment files ----------
for env_path in ".env" "apps/mobile/.env"; do
  example="${env_path}.example"
  if [ ! -f "$env_path" ] && [ -f "$example" ]; then
    info "Creating ${env_path} from ${example}..."
    cp "$example" "$env_path"
  fi
done

ok "Environment files ready"

# ---------- Install dependencies ----------
if [ ! -d node_modules ] || [ ! -d node_modules/.pnpm ]; then
  info "Installing dependencies..."
  pnpm install
fi

ok "Dependencies installed"

# ---------- Done ----------
echo ""
echo "  Quick start:"
echo "    make dev          # Web (default)"
echo "    make dev-desktop  # Desktop"
echo "    make dev-mobile   # Mobile"
echo ""
