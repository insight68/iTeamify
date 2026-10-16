#!/usr/bin/env bash
# Run inside a transient systemd service, independently of the SSH observer.
set -Eeuo pipefail
JOB_DIR="$1"
DEPLOY_LOCK_DIR="$2"
RELEASE_ID="$3"

finish() {
  local rc=$?
  trap - EXIT
  date -u +%FT%TZ >"$JOB_DIR/finished-at"
  # Capture cgroup totals before systemd --collect discards the unit. Metrics
  # are diagnostic and must never replace the payload's real exit status.
  sudo systemctl show "aurocreator-web-deploy-$RELEASE_ID.service" \
    -p MemoryPeak -p CPUUsageNSec >"$JOB_DIR/resources" 2>/dev/null || true
  if sudo test -f "$DEPLOY_LOCK_DIR/owner" && sudo grep -Fxq "$RELEASE_ID" "$DEPLOY_LOCK_DIR/owner"; then
    sudo rm -f -- "$DEPLOY_LOCK_DIR/owner"
    sudo rmdir -- "$DEPLOY_LOCK_DIR" || true
  fi
  printf '%s\n' "$rc" >"$JOB_DIR/exit-code.tmp"
  mv -f -- "$JOB_DIR/exit-code.tmp" "$JOB_DIR/exit-code"
  echo "web_job_finished=$RELEASE_ID exit=$rc"
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! sudo test -f "$DEPLOY_LOCK_DIR/owner" || ! sudo grep -Fxq "$RELEASE_ID" "$DEPLOY_LOCK_DIR/owner"; then
  echo "Web job does not own the deployment lock" >&2
  exit 73
fi
date -u +%FT%TZ >"$JOB_DIR/started-at"
bash "$JOB_DIR/payload.sh"
