#!/usr/bin/env bash
# Teamify Frontend Deployment Script (Next.js only)
# Usage: ./scripts/deploy-frontend.sh [user@host] [ssh-port]
# Example: ./scripts/deploy-frontend.sh root@q3 22
#
# This script:
# 1. Packages local source code (frontend only)
# 2. Uploads to remote server via SCP
# 3. On remote: installs deps, builds Next.js
# 4. Copies build artifacts to target directory
# 5. Restarts teamify-web service

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REMOTE_HOST="${1:-root@q3}"
REMOTE_PORT="${2:-22}"
REMOTE_DIR="/opt/teamify-build"
TARGET_DIR="/opt/teamify"
BACKUP_DIR="/opt/teamify-backup-$(date +%Y%m%d-%H%M%S)"

# Proxy for external network access (if needed)
PROXY_URL="http://127.0.0.1:3355"

# Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()  { printf "${BOLD}${CYAN}==> %s${RESET}\n" "$*"; }
ok()    { printf "${BOLD}${GREEN}✓ %s${RESET}\n" "$*"; }
fail()  { printf "${BOLD}${RED}✗ %s${RESET}\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Step 1: Package frontend source code
# ---------------------------------------------------------------------------
info "Step 1: Packaging frontend source code..."

LOCAL_TMP=$(mktemp -d)
trap "rm -rf $LOCAL_TMP" EXIT

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# Create tarball with frontend-related files only
tar czf "$LOCAL_TMP/teamify-frontend.tar.gz" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='server/bin' \
  --exclude='*.tar.gz' \
  --exclude='.cursor' \
  --exclude='agent-transcripts' \
  --exclude='.pnpm-store' \
  --exclude='apps/desktop' \
  --exclude='apps/docs' \
  --exclude='apps/storybook' \
  --exclude='server' \
  --exclude='e2e' \
  .

SRC_SIZE=$(du -h "$LOCAL_TMP/teamify-frontend.tar.gz" | cut -f1)
ok "Frontend source packaged: $SRC_SIZE"

# ---------------------------------------------------------------------------
# Step 2: Upload to remote server
# ---------------------------------------------------------------------------
info "Step 2: Uploading to $REMOTE_HOST (port $REMOTE_PORT)..."

scp -P "$REMOTE_PORT" -o ConnectTimeout=30 \
  "$LOCAL_TMP/teamify-frontend.tar.gz" \
  "$REMOTE_HOST:$REMOTE_DIR-frontend.tar.gz"

ok "Uploaded to remote"

# ---------------------------------------------------------------------------
# Step 3: Remote build and deploy
# ---------------------------------------------------------------------------
info "Step 3: Building and deploying frontend on remote..."

ssh -p "$REMOTE_PORT" -o ConnectTimeout=30 "$REMOTE_HOST" << 'REMOTE_SCRIPT'
set -euo pipefail

REMOTE_DIR="/opt/teamify-build"
TARGET_DIR="/opt/teamify"
BACKUP_DIR="/opt/teamify-backup-$(date +%Y%m%d-%H%M%S)"
PROXY_URL="http://127.0.0.1:3355"

# Set proxy FIRST (before any network operations)
export HTTP_PROXY="$PROXY_URL"
export HTTPS_PROXY="$PROXY_URL"
export http_proxy="$PROXY_URL"
export https_proxy="$PROXY_URL"

info()  { printf "==> %s\n" "$*"; }
ok()    { printf "✓ %s\n" "$*"; }
fail()  { printf "✗ %s\n" "$*" >&2; exit 1; }

# Ensure pnpm is in PATH
export PATH="/root/.local/share/pnpm:$PATH"
export PNPM_HOME="/root/.local/share/pnpm"

# Extract source
info "Extracting frontend source code..."
mkdir -p "$REMOTE_DIR"
tar xzf "$REMOTE_DIR-frontend.tar.gz" -C "$REMOTE_DIR"
cd "$REMOTE_DIR"
ok "Source extracted to $REMOTE_DIR"

# Next.js rewrites (/auth, /api, /ws) are baked in at BUILD time via REMOTE_API_URL
# in next.config.ts — not read from runtime systemd env. Merge production .env so
# the build proxies to the local Go backend (default port 8088 on q3).
if [ -f "$TARGET_DIR/.env" ]; then
  info "Merging production env from $TARGET_DIR/.env for build-time rewrites..."
  grep -E '^(REMOTE_API_URL|CORS_ALLOWED_ORIGINS|FRONTEND_ORIGIN)=' "$TARGET_DIR/.env" >> .env 2>/dev/null || true
fi
if ! grep -q '^REMOTE_API_URL=' .env 2>/dev/null; then
  echo "REMOTE_API_URL=http://127.0.0.1:8088" >> .env
  info "REMOTE_API_URL not set — defaulting to http://127.0.0.1:8088"
fi
info "Build will use REMOTE_API_URL=$(grep '^REMOTE_API_URL=' .env | tail -1)"

# ---------------------------------------------------------------------------
# Step 3a: Install dependencies
# ---------------------------------------------------------------------------
info "Configuring npm registry and installing dependencies..."

# Configure npm/pnpm to use China mirror for faster downloads
npm config set registry https://registry.npmmirror.com --global
pnpm config set registry https://registry.npmmirror.com --global

# Only install dependencies for web and shared packages (skip desktop)
CI=true pnpm install --filter @teamify/web --filter @teamify/core --filter @teamify/ui --filter @teamify/views
ok "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 3b: Build frontend (Next.js)
# ---------------------------------------------------------------------------
info "Building Next.js frontend..."
REMOTE_API_URL="$(grep '^REMOTE_API_URL=' .env | tail -1 | cut -d= -f2-)"
REMOTE_API_URL="${REMOTE_API_URL:-http://127.0.0.1:8088}"
export REMOTE_API_URL
STANDALONE=true pnpm --filter @teamify/web build

# Standalone output can ship a stale routes-manifest (8080 default). Ensure
# the copy systemd actually runs matches the build-time REMOTE_API_URL.
STANDALONE_MANIFEST="apps/web/.next/standalone/apps/web/.next/routes-manifest.json"
if [ -f "$STANDALONE_MANIFEST" ]; then
  sed -i "s|http://localhost:8080|${REMOTE_API_URL}|g" "$STANDALONE_MANIFEST"
fi
ok "Frontend built (REMOTE_API_URL=${REMOTE_API_URL})"

# ---------------------------------------------------------------------------
# Step 4: Deploy to target directory
# ---------------------------------------------------------------------------
info "Deploying to $TARGET_DIR..."

# Stop web service before copying files
info "Stopping web service..."
systemctl stop teamify-web || true

# Wait for processes to fully stop
sleep 2

# Backup current deployment
if [ -d "$TARGET_DIR" ]; then
  info "Backing up current deployment to $BACKUP_DIR..."
  cp -r "$TARGET_DIR" "$BACKUP_DIR"
  ok "Backup created"
fi

# Copy new frontend build
cp -r apps/web/.next/standalone/* "$TARGET_DIR/"

# Ensure data directory exists
mkdir -p "$TARGET_DIR/data/uploads"

ok "Frontend deployed to $TARGET_DIR"

# ---------------------------------------------------------------------------
# Step 5: Restart web service
# ---------------------------------------------------------------------------
info "Restarting web service..."
systemctl daemon-reload
systemctl start teamify-web
sleep 3

# Check status
if systemctl is-active --quiet teamify-web; then
  ok "Web service restarted successfully"
else
  fail "Web service restart failed"
fi

# Show status
systemctl status teamify-web --no-pager

REMOTE_SCRIPT

ok "Frontend deployment complete!"
