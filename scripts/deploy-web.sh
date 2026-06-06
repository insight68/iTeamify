#!/usr/bin/env bash
#
# deploy-web.sh — Build & deploy the Next.js standalone web frontend.
#
# Usage:
#   ./deploy-web.sh            # full build + sync + restart
#   ./deploy-web.sh --sync-only  # skip build, just sync & restart
#   ./deploy-web.sh --stop       # stop the service only
#   ./deploy-web.sh --status     # check service status only
#
# Designed to run on the server (root@q3). The build step runs as
# hermes (the dev user) in /home/hermes/teamify; the sync and restart
# steps run as root, deploying to /opt/teamify.
#
# Prerequisites:
#   - hermes user with teamify repo at /home/hermes/teamify
#   - pnpm installed and in hermes's PATH
#   - systemd service "multica-web" already configured
#   - /opt/teamify/.env with production vars
#

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────
SERVICE_NAME="multica-web"
BUILD_USER="hermes"
BUILD_DIR="/home/hermes/teamify"
DEPLOY_DIR="/opt/teamify"

# Next.js standalone output lives inside the workspace-root subdirectory
# (pnpm monorepo: the workspace folder name becomes part of the path).
# We strip that layer when syncing so it matches the systemd WorkingDirectory.
STANDALONE_SRC="${BUILD_DIR}/apps/web/.next/standalone/teamify/apps/web"
STANDALONE_DST="${DEPLOY_DIR}/apps/web/.next/standalone/apps/web"
STATIC_SRC="${BUILD_DIR}/apps/web/.next/static"
STATIC_DST="${STANDALONE_DST}/.next/static"
PUBLIC_SRC="${BUILD_DIR}/apps/web/public"
PUBLIC_DST="${STANDALONE_DST}/public"

# ── Helpers ─────────────────────────────────────────────────────────
info()  { echo "[$(date '+%H:%M:%S')] INFO:  $*"; }
warn()  { echo "[$(date '+%H:%M:%S')] WARN:  $*"; }
error() { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; exit 1; }

# ── Parse args ──────────────────────────────────────────────────────
ACTION="full"
for arg in "${@:-}"; do
  case "$arg" in
    --sync-only)  ACTION="sync_only" ;;
    --stop)       ACTION="stop" ;;
    --status)     ACTION="status" ;;
    --help|-h)
      echo "Usage: $0 [--sync-only|--stop|--status|--help]"
      exit 0 ;;
    *) error "Unknown argument: $arg" ;;
  esac
done

# ── Status only ─────────────────────────────────────────────────────
if [[ "$ACTION" == "status" ]]; then
  systemctl status "$SERVICE_NAME" --no-pager || true
  exit 0
fi

# ── Stop only ───────────────────────────────────────────────────────
if [[ "$ACTION" == "stop" ]]; then
  info "Stopping ${SERVICE_NAME}..."
  systemctl stop "$SERVICE_NAME" || true
  systemctl status "$SERVICE_NAME" --no-pager || true
  info "Stopped."
  exit 0
fi

# ── Build ───────────────────────────────────────────────────────────
if [[ "$ACTION" == "full" ]]; then
  info "Building Next.js standalone as ${BUILD_USER}..."

  # Check that the build directory exists
  if [[ ! -d "$BUILD_DIR" ]]; then
    error "Build directory ${BUILD_DIR} does not exist. Clone the repo first."
  fi

  # Run build as hermes (not root)
  if sudo -u "$BUILD_USER" bash -lc "cd ${BUILD_DIR} && STANDALONE=true pnpm --filter @teamify/web build"; then
    info "Build succeeded."
  else
    error "Build failed. Check logs above."
  fi

  # Verify standalone output exists
  if [[ ! -f "${STANDALONE_SRC}/server.js" ]]; then
    error "Standalone output not found at ${STANDALONE_SRC}/server.js. Did STANDALONE=true get set?"
  fi
  info "Standalone server.js found."
fi

# ── Stop service ────────────────────────────────────────────────────
info "Stopping ${SERVICE_NAME} for deployment..."
systemctl stop "$SERVICE_NAME" || true

# ── Sync standalone ─────────────────────────────────────────────────
info "Syncing standalone build to ${STANDALONE_DST}..."
mkdir -p "$STANDALONE_DST"
rsync -avL --delete "${STANDALONE_SRC}/" "${STANDALONE_DST}/"
info "Standalone synced."

# ── Sync static assets ──────────────────────────────────────────────
info "Syncing static assets to ${STATIC_DST}..."
mkdir -p "$STATIC_DST"
rsync -av --delete "${STATIC_SRC}/" "${STATIC_DST}/"
info "Static assets synced."

# ── Sync public assets ──────────────────────────────────────────────
info "Syncing public assets to ${PUBLIC_DST}..."
mkdir -p "$PUBLIC_DST"
rsync -av "${PUBLIC_SRC}/" "${PUBLIC_DST}/"
info "Public assets synced."

# ── Start service ───────────────────────────────────────────────────
info "Starting ${SERVICE_NAME}..."
systemctl start "$SERVICE_NAME"
sleep 2

# ── Verify ──────────────────────────────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME"; then
  info "✓ ${SERVICE_NAME} is running."
  systemctl status "$SERVICE_NAME" --no-pager
else
  error "${SERVICE_NAME} failed to start. Check: journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
fi