# shellcheck shell=bash
# Web sync, build, smoke-test, activation, rollback, and verification lifecycle.

# Fail on source errors before acquiring the production lock or activating Go.
phase_check_web_sources() {
  require_cmd pnpm || return 1
  log "preflight: 本机检查 Web 与共享包 TypeScript"
  (cd "$LOCAL_DIR" && pnpm exec turbo typecheck --filter=@iteamify/web...)
  ok "Web 与共享包 TypeScript 检查通过"
}

# ============ Sync the isolated frontend build workspace ============
phase_sync_web() {
  # web-only sync neither uploads nor deletes Go sources in the remote build workspace.
  local -a server_filters=(--filter='hide /server/' --filter='protect /server/')
  local sync_started=$SECONDS
  log "sync: 增量同步前端源码到 $REMOTE_DIR/build/src（运行中的 release 不受影响）"
  log "sync: 排除全部 .next-* 本地构建产物，保留服务器 .next 编译缓存"
  ssh_exec_env REMOTE_DIR DEPLOY_USER <<'REMOTE'
set -Eeuo pipefail
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$REMOTE_DIR" "$REMOTE_DIR/build" "$REMOTE_DIR/build/src" "$REMOTE_DIR/releases"
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/log/aurocreator
REMOTE

  # 白名单同步：生产构建只需要 Go backend、Next web 和共享 packages。
  # receiver protect 规则保留远端构建缓存；其余未列入白名单的旧文件会删除。
  rsync -az --delete --stats --timeout=120 \
    --filter='hide /node_modules/' \
    --filter='protect /node_modules/' \
    --filter='hide /apps/web/.next/' \
    --filter='protect /apps/web/.next/' \
    --filter='hide /.turbo/' \
    --filter='protect /.turbo/' \
    --filter='hide .env' \
    --filter='hide .env.*' \
    --filter='hide .envrc' \
    --filter='hide node_modules' \
    --filter='protect node_modules' \
    --filter='hide .next/' \
    --filter='hide .next-*/' \
    --filter='protect .next-performance-*/' \
    --filter='hide .iteamify/' \
    --filter='protect .iteamify/' \
    --filter='hide .git/' \
    --filter='hide dist/' \
    --filter='hide build/' \
    --filter='hide .turbo/' \
    --filter='hide .venv/' \
    --filter='hide __pycache__/' \
    --filter='hide *.pyc' \
    --filter='hide .pytest_cache/' \
    --filter='hide .ruff_cache/' \
    --filter='hide *.egg-info/' \
    --filter='hide coverage/' \
    --filter='hide test-results/' \
    --filter='hide *.tsbuildinfo' \
    --filter='hide *.log' \
    --filter='hide .DS_Store' \
    --filter='show /package.json' \
    --filter='show /pnpm-lock.yaml' \
    --filter='show /pnpm-workspace.yaml' \
    --filter='show /turbo.json' \
    --filter='show /.npmrc' \
    --filter='show /.gitignore' \
    --filter='show /.github/' \
    --filter='show /.github/workflows/' \
    --filter='show /.github/workflows/ci.yml' \
    --filter='hide /.github/***' \
    --filter='show /apps/' \
    --filter='show /apps/web/***' \
    --filter='hide /apps/***' \
    --filter='show /packages/***' \
    "${server_filters[@]}" \
    --filter='hide *' \
    -e "ssh ${SSH_KEY:+-i \"$SSH_KEY\"} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=$SSH_CONTROL_PATH" \
    "$LOCAL_DIR/" "$SSH_HOST:$REMOTE_DIR/build/src/"
  ok "sync 完成（$((SECONDS - sync_started))s）"
  phase_sync_web_helper
}

phase_sync_web_helper() {
  ssh_exec_env REMOTE_DIR DEPLOY_USER <<'REMOTE'
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$REMOTE_DIR/build/deploy"
REMOTE
  rsync -az -e "ssh ${SSH_KEY:+-i \"$SSH_KEY\"} -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=$SSH_CONTROL_PATH" \
    "$SCRIPT_DIR/deploy/aurocreator/web-release.py" "$SCRIPT_DIR/deploy/aurocreator/web-job-runner.sh" \
    "$SSH_HOST:$REMOTE_DIR/build/deploy/"
}

# Dispatch once; SSH only observes logs and never owns the build process.
ssh_web_job_exec_env() {
  prepare_build_tmp
  local var_name
  {
    for var_name in "$@"; do
      printf 'export %s=%q\n' "$var_name" "${!var_name}"
    done
    cat
  } >"$BUILD_TMP/web-job.sh"
  upload_release_artifacts "$BUILD_TMP/web-job.sh"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_LOCK_DIR DEPLOY_USER WEB_REUSE_BUILD WEB_RETRY_BUILD <<'REMOTE'
set -Eeuo pipefail
JOB_DIR="$REMOTE_DIR/build/deploy/jobs/$RELEASE_ID"
UNIT="aurocreator-web-deploy-$RELEASE_ID.service"
if sudo systemctl is-active --quiet "$UNIT"; then
  echo "Web 发布任务仍在运行，拒绝重复启动：$UNIT" >&2
  exit 73
fi
if [ -e "$JOB_DIR" ]; then
  if { [ "$WEB_REUSE_BUILD" = 1 ] || [ "$WEB_RETRY_BUILD" = 1 ]; } && [ -f "$JOB_DIR/exit-code" ] &&
     [ "$(cat "$JOB_DIR/exit-code")" != 0 ] &&
     [ ! -e "$REMOTE_DIR/web-releases/$RELEASE_ID/.activated" ]; then
    install -d -m 0700 "$REMOTE_DIR/build/deploy/failed-jobs"
    mv "$JOB_DIR" "$REMOTE_DIR/build/deploy/failed-jobs/$RELEASE_ID-$(date -u +%Y%m%dT%H%M%SZ)"
  else
    echo "Web 发布任务已存在，请先查看 web-status：$JOB_DIR" >&2
    exit 73
  fi
fi
install -d -m 0700 "$JOB_DIR"
cp "$REMOTE_DIR/incoming/$RELEASE_ID/web-job.sh" "$JOB_DIR/payload.sh"
chmod 600 "$JOB_DIR/payload.sh"
if [ -f "/var/log/aurocreator/web-deploy-$RELEASE_ID.log" ]; then
  wc -l <"/var/log/aurocreator/web-deploy-$RELEASE_ID.log" >"$JOB_DIR/log-start-line"
else
  printf '0\n' >"$JOB_DIR/log-start-line"
fi
sudo systemd-run --quiet --collect --unit="$UNIT" --uid="$DEPLOY_USER" \
  --setenv=PATH=/usr/local/bin:/usr/bin:/bin \
  --property=Type=exec --property=RuntimeMaxSec=3600 --property=TimeoutStopSec=30 \
  --property=KillMode=control-group --working-directory="$REMOTE_DIR/build/src" \
  /bin/bash "$REMOTE_DIR/build/deploy/web-job-runner.sh" "$JOB_DIR" "$DEPLOY_LOCK_DIR" "$RELEASE_ID"
REMOTE
  # The service now owns the lock and releases it only after the job exits.
  LOCK_HELD=0
  log "服务器托管 Web 发布；终端断开后任务继续。日志：/var/log/aurocreator/web-deploy-$RELEASE_ID.log"
  log "重新查看：RELEASE_ID=$RELEASE_ID $0 web-status"
  log "构建日志已带 UTC 时间戳；Next 编译期无输出属正常现象，静默时长会随心跳报告"
  phase_web_wait
}

# Reconnecting is observation only: no upload, build, lock acquisition or cleanup.
phase_web_wait() {
  local output line log_lines=0 job_rc="" started=$SECONDS
  local stage="初始化" saw_output=0 last_output_at=$SECONDS
  while :; do
    if ! output="$(ssh_exec_env REMOTE_DIR RELEASE_ID log_lines <<'REMOTE'
set -Eeuo pipefail
JOB_DIR="$REMOTE_DIR/build/deploy/jobs/$RELEASE_ID"
LOG="/var/log/aurocreator/web-deploy-$RELEASE_ID.log"
if [ "$log_lines" -eq 0 ] && [ -f "$JOB_DIR/log-start-line" ]; then
  log_lines="$(cat "$JOB_DIR/log-start-line")"
fi
if [ -f "$LOG" ]; then
  sed -n "$((log_lines + 1)),\$p" "$LOG"
  printf '\nweb_job_log_lines=%s\n' "$(wc -l <"$LOG")"
fi
if [ -f "$JOB_DIR/exit-code" ]; then
  printf 'web_job_exit=%s\n' "$(cat "$JOB_DIR/exit-code")"
elif ! sudo systemctl is-active --quiet "aurocreator-web-deploy-$RELEASE_ID.service"; then
  sudo journalctl -u "aurocreator-web-deploy-$RELEASE_ID.service" -n 30 --no-pager >&2 || true
  echo "Web 发布任务终止且没有完成状态，检查日志和部署锁" >&2
  exit 1
fi
REMOTE
)"; then
      err "发布观察连接中断；服务器任务可能仍在运行。请执行 RELEASE_ID=$RELEASE_ID $0 web-status"
      return 1
    fi
    saw_output=0
    while IFS= read -r line; do
      case "$line" in
        web_job_log_lines=*) log_lines="${line#*=}" ;;
        web_job_exit=*) job_rc="${line#*=}" ;;
        '--- '*)
          stage="${line#--- }"
          stage="${stage%% ---*}"
          saw_output=1
          printf '%s\n' "$line"
          ;;
        *) [ -z "$line" ] || { saw_output=1; printf '%s\n' "$line"; } ;;
      esac
    done <<<"$output"
    [ "$saw_output" -eq 1 ] && last_output_at=$SECONDS
    if [ -n "$job_rc" ]; then
      if [ "$job_rc" -ne 0 ]; then
        ssh_run "sudo journalctl -u aurocreator-web-deploy-$RELEASE_ID.service -n 30 --no-pager" >&2 || true
        err "服务器 Web 发布失败 (exit=$job_rc)"
      fi
      return "$job_rc"
    fi
    if [ $((SECONDS - last_output_at)) -ge 30 ]; then
      log "Web 发布仍在运行｜阶段: ${stage}｜已等待 $((SECONDS - started))s｜距上次新输出 $((SECONDS - last_output_at))s"
    fi
    sleep 15
  done
}

phase_web_status() {
  ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
JOB_DIR="$REMOTE_DIR/build/deploy/jobs/$RELEASE_ID"
test -d "$JOB_DIR" || { echo "未找到 Web 发布任务：$RELEASE_ID" >&2; exit 1; }
if [ -f "$JOB_DIR/exit-code" ]; then
  echo "web_job_exit=$(cat "$JOB_DIR/exit-code")"
else
  sudo systemctl show "aurocreator-web-deploy-$RELEASE_ID.service" -p ActiveState -p SubState -p MainPID -p MemoryCurrent -p MemoryPeak
fi
cat "$JOB_DIR/resources" 2>/dev/null || true
tail -n 30 "/var/log/aurocreator/web-deploy-$RELEASE_ID.log" 2>/dev/null || true
REMOTE
  phase_deploy_status
}

# Go binaries are cross-compiled locally and uploaded as tar.gz; the server
# source tree is no longer synced. Only the systemd unit files (versioned
# deployment inputs) and the release root directories are prepared here.
# ============ Build, smoke-test, and activate only the Next.js frontend ============
record_deploy_scope() {
  local deploy_scope="$1"
  ssh_exec_env REMOTE_DIR RELEASE_ID deploy_scope <<'REMOTE'
set -Eeuo pipefail
incoming="$REMOTE_DIR/incoming/$RELEASE_ID"
install -d "$incoming"
# A Web retry within a full deployment keeps the original full scope.
if [ -f "$incoming/deploy-scope" ]; then
  test "$(cat "$incoming/deploy-scope")" = "$deploy_scope" ||
    { test "$deploy_scope" = web && test "$(cat "$incoming/deploy-scope")" = deploy; }
else
  printf '%s\n' "$deploy_scope" >"$incoming/deploy-scope"
fi
REMOTE
}

phase_deploy_status() {
  ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
python3 - "$REMOTE_DIR" "$RELEASE_ID" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

root, release = Path(sys.argv[1]).resolve(), sys.argv[2]
scope_path = root / 'incoming' / release / 'deploy-scope'
scope = scope_path.read_text().strip() if scope_path.is_file() else 'unknown'
exit_path = root / 'build/deploy/jobs' / release / 'exit-code'
job_exit = int(exit_path.read_text()) if exit_path.is_file() else None
components = {}
for component, unit in [('server', 'backend'), ('web', 'web'), ('daemon', 'daemon')]:
    current = (root / (component + '-current')).resolve()
    manifest = current / 'manifest'
    values = dict(line.split('=', 1) for line in manifest.read_text().splitlines() if '=' in line) if manifest.is_file() else {}
    service_active = subprocess.run(['sudo', 'systemctl', 'is-active', '--quiet', 'aurocreator-' + unit], check=False).returncode == 0
    matches = values.get('release') == release and current == root / (component + '-releases') / release
    active = matches and service_active and (current / '.activated').is_file() and not (current / '.failed').exists()
    state = 'active' if active else 'pending'
    if (root / (component + '-releases') / release / '.failed').exists() or (component == 'web' and job_exit not in (None, 0)):
        state = 'failed'
    components[component] = {'state': state, 'active_release': values.get('release'), 'service_active': service_active}
required = ['server', 'web', 'daemon'] if scope == 'deploy' else ['web'] if scope == 'web' else []
state = 'unknown_scope' if not required else 'complete' if job_exit == 0 and all(components[c]['state'] == 'active' for c in required) else 'failed' if any(components[c]['state'] == 'failed' for c in required) else 'pending'
print(json.dumps({'release': release, 'scope': scope, 'deployment_state': state, 'web_job_exit': job_exit, 'components': components}, ensure_ascii=False, indent=2))
PY
REMOTE
}

# Resume only the already uploaded full release. Never recompile the daemon
# from a possibly changed local worktree, nor activate after another rollout.
phase_deploy_resume() {
  phase_web_wait
  acquire_deploy_lock
  local metadata daemon_ready
  metadata="$(ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
test "$(cat "$REMOTE_DIR/incoming/$RELEASE_ID/deploy-scope")" = deploy
test "$(cat "$REMOTE_DIR/build/deploy/jobs/$RELEASE_ID/exit-code")" = 0
for component in server web; do
  current="$(readlink -f "$REMOTE_DIR/$component-current")"
  test "$current" = "$REMOTE_DIR/$component-releases/$RELEASE_ID"
  test -f "$current/.activated"
  test ! -e "$current/.failed"
  grep -Fxq "release=$RELEASE_ID" "$current/manifest"
done
test -f "$REMOTE_DIR/incoming/$RELEASE_ID/daemon.tar.gz"
python3 - "$REMOTE_DIR/server-releases/$RELEASE_ID/manifest" <<'PY'
import sys
from pathlib import Path
values = dict(line.split('=', 1) for line in Path(sys.argv[1]).read_text().splitlines() if '=' in line)
parts = [values[key] for key in ['commit', 'version', 'built_at']]
if any(not p or '\t' in p or '\r' in p or '\n' in p for p in parts):
    raise SystemExit('Invalid release metadata')
print('\t'.join(parts))
PY
REMOTE
)" || { err "拒绝继续：full scope、任务状态或当前组件版本不匹配"; return 1; }
  IFS=$'\t' read -r DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE <<<"$metadata"
  daemon_ready="$(ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
current="$(readlink -f "$REMOTE_DIR/daemon-current" 2>/dev/null || true)"
if [ "$current" = "$REMOTE_DIR/daemon-releases/$RELEASE_ID" ] && [ -f "$current/.activated" ] && [ ! -e "$current/.failed" ]; then
  echo 1
else
  echo 0
fi
REMOTE
)"
  if [ "$daemon_ready" != 1 ]; then
    phase_build_daemon_activate
  fi
  phase_verify
  phase_deploy_status
  release_deploy_lock
}

phase_build_web_activate() {
  log "web build: pnpm + Next standalone（后端、CLI 与 daemon 保持不变）"
  ssh_web_job_exec_env REMOTE_DIR RELEASE_ID DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE PNPM_VERSION ITEAMIFY_APP_URL RELEASE_KEEP WEB_ASSET_KEEP WEB_ASSET_DAYS TURBO_CACHE_KEEP NEXT_CACHE_MAX_MB INSTALL_SCOPE_VERSION DEPLOY_USER PORT_BACKEND PORT_NEXT WEB_REUSE_BUILD WEB_RETRY_BUILD <<'REMOTE'
set -Eeuo pipefail

BUILD_ROOT="$REMOTE_DIR/build/src"
WEB_RELEASE_ROOT="$REMOTE_DIR/web-releases"
WEB_RELEASE_DIR="$WEB_RELEASE_ROOT/$RELEASE_ID"
WEB_CURRENT="$REMOTE_DIR/web-current"
WEB_HELPER="$REMOTE_DIR/build/deploy/web-release.py"
WEB_ASSETS="$REMOTE_DIR/web-assets"
JOB_DIR="$REMOTE_DIR/build/deploy/jobs/$RELEASE_ID"
DEPLOY_LOG="/var/log/aurocreator/web-deploy-$RELEASE_ID.log"
LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
LEGACY_CURRENT_BEFORE="$LEGACY_CURRENT"
SERVER_RELEASE=""
if [ -L "$REMOTE_DIR/server-current" ]; then
  SERVER_RELEASE="$(readlink -f "$REMOTE_DIR/server-current")"
else
  SERVER_RELEASE="$LEGACY_CURRENT"
fi
SERVER_RELEASE_BEFORE="$SERVER_RELEASE"
PREVIOUS_WEB=""
if [ -L "$WEB_CURRENT" ]; then
  PREVIOUS_WEB="$(readlink -f "$WEB_CURRENT")"
else
  PREVIOUS_WEB="$LEGACY_CURRENT/web"
fi
WEB_ENV=/etc/aurocreator/web.env
WEB_UNIT=/etc/systemd/system/aurocreator-web.service
WEB_ENV_BACKUP="/tmp/aurocreator-web-env-$RELEASE_ID.backup"
WEB_UNIT_BACKUP="/tmp/aurocreator-web-unit-$RELEASE_ID.backup"
WEB_ENV_EXISTED=0
WEB_UNIT_EXISTED=0
RUNTIME_BACKUP_CREATED=0
# EnvironmentFile values override Environment= entries in the unit, so use the
# env file as the authoritative previous runtime port when it is present.
PREVIOUS_WEB_PORT="$(sudo awk -F= '$1 == "PORT" {print $2; exit}' "$WEB_ENV" 2>/dev/null || true)"
if [ -z "$PREVIOUS_WEB_PORT" ]; then
  PREVIOUS_WEB_PORT="$(sudo systemctl show aurocreator-web -p Environment --value 2>/dev/null | tr ' ' '\n' | awk -F= '$1 == "PORT" {print $2; exit}')"
fi
BACKEND_PID_BEFORE="$(sudo systemctl show aurocreator-backend -p MainPID --value)"
DAEMON_PID_BEFORE="$(sudo systemctl show aurocreator-daemon -p MainPID --value 2>/dev/null || echo 0)"
CLI_TARGET_BEFORE="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
ACTIVATED=0
CANDIDATE_CREATED=0

web_runtime_complete() {
  local release="$1"
  [ -d "$release" ] && [ -f "$release/apps/web/server.js" ]
}

managed_web_release_complete() {
  local release="$1"
  case "$release" in
    "$WEB_RELEASE_ROOT"/*) ;;
    *) return 1 ;;
  esac
  web_runtime_complete "$release" && [ -f "$release/manifest" ]
}

# Next prints nothing while it compiles, so a long silent stage is
# indistinguishable from a hung one. Stamp every streamed line with its UTC
# arrival time; the release-scoped log then shows when output actually arrived.
stamp_lines() {
  local line compiler_output_seen=0
  while IFS= read -r line; do
    printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$line"
    if [ "${label:-}" = "Next standalone build" ] && [ "$compiler_output_seen" = 0 ]; then
      case "$line" in
        *'next build --'*)
          compiler_output_seen=1
          # On a Turbo hit this may be replayed output, so do not label it as
          # actual compiler CPU time. The cache hit/miss line disambiguates it.
          printf 'build_compiler_output_after_seconds=%s\n' "$((SECONDS - started))"
          printf 'compiler output delay\t%s\t0\n' "$((SECONDS - started))" >>"$JOB_DIR/stage-timings.tsv"
          ;;
      esac
    fi
  done
}

# Keep the wrapped command's exit status (PIPESTATUS[0]) instead of the
# stamping stage's status so run_logged still reports real build failures.
stream_with_timestamps() {
  local -a statuses
  "$@" 2>&1 | stamp_lines
  statuses=("${PIPESTATUS[@]}")
  return "${statuses[0]}"
}

run_logged() {
  local label="$1"
  local stage_log="$2"
  local -a statuses
  local rc started
  shift 2
  started="$SECONDS"
  printf -- '--- %s --- [%s UTC, started]\n' "$label" "$(date -u +%H:%M:%S)"
  # Web builds can take several minutes. Stream their timestamped progress
  # while retaining the complete release-scoped log so a healthy build never
  # looks hung. `set --` prepends the stamping wrapper and keeps this the
  # single release-scoped stage logger asserted by deploy-aurocreator.test.sh.
  set -- stream_with_timestamps "$@"
  if "$@" 2>&1 | tee "$stage_log"; then
    printf -- '--- %s --- [%s UTC, ok %ss]\n' "$label" "$(date -u +%H:%M:%S)" "$((SECONDS - started))"
    printf '%s\t%s\t0\n' "$label" "$((SECONDS - started))" >>"$JOB_DIR/stage-timings.tsv"
    return 0
  else
    statuses=("${PIPESTATUS[@]}")
    rc="${statuses[0]}"
    [ "$rc" -ne 0 ] || rc="${statuses[1]}"
    printf 'ERROR: %s 失败 (exit=%s, %ss)，完整日志：%s\n' "$label" "$rc" "$((SECONDS - started))" "$stage_log" >&2
    printf '%s\t%s\t%s\n' "$label" "$((SECONDS - started))" "$rc" >>"$JOB_DIR/stage-timings.tsv"
    return "$rc"
  fi
}

log_cache_sizes() {
  local phase="$1" cache directory size
  for cache in turbo webpack turbopack next_total; do
    case "$cache" in
      turbo) directory="$BUILD_ROOT/.turbo/cache" ;;
      next_total) directory="$BUILD_ROOT/apps/web/.next/cache" ;;
      *) directory="$BUILD_ROOT/apps/web/.next/cache/$cache" ;;
    esac
    size="$(du -sm "$directory" 2>/dev/null | awk '{print $1}' || true)"
    printf 'cache_%s_%s_mb=%s\n' "$cache" "$phase" "${size:-0}"
  done
}

wait_http() {
  local url="$1"
  local attempts="${2:-60}"
  for _ in $(seq 1 "$attempts"); do
    if curl --fail --silent --show-error --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback_web() {
  local reason="$1"
  local rollback_release=""
  echo "前端激活失败，开始回滚：$reason" >&2

  if [ "$RUNTIME_BACKUP_CREATED" -eq 1 ]; then
    if [ "$WEB_ENV_EXISTED" -eq 1 ]; then
      sudo cp -a -- "$WEB_ENV_BACKUP" "$WEB_ENV"
    else
      sudo rm -f -- "$WEB_ENV"
    fi
    if [ "$WEB_UNIT_EXISTED" -eq 1 ]; then
      sudo cp -a -- "$WEB_UNIT_BACKUP" "$WEB_UNIT"
    else
      sudo rm -f -- "$WEB_UNIT"
    fi
  fi

  if web_runtime_complete "$PREVIOUS_WEB"; then
    rollback_release="$PREVIOUS_WEB"
  else
    while IFS= read -r candidate; do
      [ "$candidate" = "$WEB_RELEASE_DIR" ] && continue
      [ -f "$candidate/.activated" ] || continue
      if managed_web_release_complete "$candidate"; then
        rollback_release="$candidate"
        break
      fi
    done < <(find "$WEB_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
      -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)
  fi

  if [ -z "$rollback_release" ] && web_runtime_complete "$LEGACY_CURRENT/web"; then
    rollback_release="$LEGACY_CURRENT/web"
  fi

  if [ -n "$rollback_release" ]; then
    sudo ln -sfn "$rollback_release" "$WEB_CURRENT.rollback"
    sudo mv -Tf "$WEB_CURRENT.rollback" "$WEB_CURRENT"
    touch "$WEB_RELEASE_DIR/.failed" 2>/dev/null || true
    sudo systemctl daemon-reload
    sudo systemctl restart aurocreator-web || true
    wait_http "http://127.0.0.1:${PREVIOUS_WEB_PORT:-$PORT_NEXT}" 30 || true
    echo "前端回滚目标：$rollback_release" >&2
  else
    echo "没有找到完整前端回滚版本；保留 web-current" >&2
  fi
  sudo systemctl --no-pager --full status aurocreator-web || true
}

on_web_exit() {
  local rc=$?
  trap - EXIT
  if [ "$rc" -ne 0 ]; then
    if [ "$ACTIVATED" -eq 1 ]; then
      rollback_web "发布脚本退出码 $rc"
    elif [ "$CANDIDATE_CREATED" -eq 1 ] && [ -d "$WEB_RELEASE_DIR" ]; then
      touch "$WEB_RELEASE_DIR/.failed" 2>/dev/null || true
    fi
  fi
  exit "$rc"
}
trap on_web_exit EXIT

sudo touch "$DEPLOY_LOG"
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

# The artifact identity is the content of the sources plus the values that are
# baked into the bundle. An unchanged tree therefore keeps one Turbo hash and
# one public asset archive across deployments, while every deployment still
# gets a fresh RELEASE_ID for its directories, lock and log. Rolling back or
# retrying the same sources reuses the same artifact instead of forcing the
# 2 vCPU host through another cold compile.
DEPLOYMENT_ID="$(python3 "$WEB_HELPER" fingerprint "$BUILD_ROOT" \
  --input "NEXT_PUBLIC_APP_VERSION=$DEPLOY_VERSION" \
  --input "REMOTE_API_URL=http://127.0.0.1:$PORT_BACKEND" \
  --input "node=$(node -v)" \
  --input "next_dist_dir=.next" \
  --input "standalone=true")"
echo "deployment_id=${DEPLOYMENT_ID}（源码与构建输入指纹，非 RELEASE_ID）"

if [ -e "$WEB_RELEASE_DIR" ]; then
  if { [ "$WEB_REUSE_BUILD" != 1 ] && [ "$WEB_RETRY_BUILD" != 1 ]; } || [ -e "$WEB_RELEASE_DIR/.activated" ] || [ "$PREVIOUS_WEB" = "$WEB_RELEASE_DIR" ]; then
    echo "前端 release 已存在，拒绝覆盖：$WEB_RELEASE_DIR" >&2
    exit 1
  fi
  if [ "$WEB_REUSE_BUILD" = 1 ]; then
    python3 "$WEB_HELPER" validate-build "$BUILD_ROOT/apps/web/.next" "$DEPLOYMENT_ID"
  fi
  install -d "$REMOTE_DIR/build/failed-web"
  mv "$WEB_RELEASE_DIR" "$REMOTE_DIR/build/failed-web/$RELEASE_ID-$(date -u +%Y%m%dT%H%M%SZ)"
fi
if [ -z "$SERVER_RELEASE" ] || [ ! -x "$SERVER_RELEASE/bin/aurocreator-backend" ] || \
   [ ! -d "$SERVER_RELEASE/server/migrations" ]; then
  echo "当前 Server release 不可用，拒绝前端独立发布：$SERVER_RELEASE" >&2
  exit 1
fi
# 首次部署时 web current 尚未创建：PREVIOUS_WEB 路径不存在，放过完整性检查。
if [ -e "$PREVIOUS_WEB" ] && ! web_runtime_complete "$PREVIOUS_WEB"; then
  echo "当前前端运行目录不完整，拒绝发布：$PREVIOUS_WEB" >&2
  exit 1
fi
sudo systemctl is-active --quiet aurocreator-backend
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$PORT_BACKEND/readyz" >/dev/null
install -d "$WEB_RELEASE_ROOT" "$WEB_RELEASE_DIR"
CANDIDATE_CREATED=1

cd "$BUILD_ROOT"
if [ "$WEB_REUSE_BUILD" = 1 ]; then
  python3 "$WEB_HELPER" validate-build "$BUILD_ROOT/apps/web/.next" "$DEPLOYMENT_ID"
  DEPLOY_DATE="$(date -u -r "$BUILD_ROOT/apps/web/.next/BUILD_ID" +%FT%TZ)"
  echo "复用已完成的同源码 standalone 构建：${RELEASE_ID}（deployment_id=${DEPLOYMENT_ID}）"
else
export PNPM_CONFIG_UPDATE_NOTIFIER=false
CURRENT_PNPM="$(pnpm --version 2>/dev/null || true)"
if [ "$CURRENT_PNPM" != "$PNPM_VERSION" ]; then
  sudo rm -rf "$(sudo npm root -g 2>/dev/null)/pnpm" 2>/dev/null || true
  sudo npm install -g --force "pnpm@${PNPM_VERSION}"
  for b in pnpm pnpx pnpm-store; do
    if [ -x "/usr/local/node-current/bin/$b" ]; then
      sudo ln -snf "/usr/local/node-current/bin/$b" "/usr/local/bin/$b"
    fi
  done
fi
CURRENT_PNPM="$(pnpm --version)"
if [ "$CURRENT_PNPM" != "$PNPM_VERSION" ]; then
  echo "pnpm version mismatch: $CURRENT_PNPM (expected $PNPM_VERSION)" >&2
  exit 1
fi
echo "pnpm runtime accepted: $CURRENT_PNPM"

export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
INSTALL_SCOPE_MARKER="$BUILD_ROOT/node_modules/.iteamify-install-scope"
if ! grep -Fxq "$INSTALL_SCOPE_VERSION" "$INSTALL_SCOPE_MARKER" 2>/dev/null; then
  echo "pnpm 安装范围变更为 ${INSTALL_SCOPE_VERSION}，清理旧全量 workspace 依赖"
  rm -rf -- "$BUILD_ROOT/node_modules"
  find "$BUILD_ROOT/apps" "$BUILD_ROOT/packages" \
    -mindepth 2 -maxdepth 2 -name node_modules -exec rm -rf -- {} + 2>/dev/null || true
fi
run_logged "pnpm install" "/tmp/aurocreator-web-pnpm-install-$RELEASE_ID.log" \
  pnpm --filter . --filter '@iteamify/web...' install --frozen-lockfile --prefer-offline
printf '%s\n' "$INSTALL_SCOPE_VERSION" >"$INSTALL_SCOPE_MARKER"

rm -f -- "$BUILD_ROOT/apps/web/.next/lock"
BUILD_BUNDLER="$(node -p 'const s=require("./apps/web/package.json").scripts.build; s.includes("--webpack") ? "webpack" : s.includes("--turbopack") ? "turbopack" : "next-default"')"
echo "build_bundler=${BUILD_BUNDLER}（缓存命中与编译耗时以本次日志为准）"
log_cache_sizes before
BUILD_RC=0
run_logged "Next standalone build" "/tmp/aurocreator-web-next-build-$RELEASE_ID.log" \
  env STANDALONE=true NEXT_DIST_DIR=.next REMOTE_API_URL="http://127.0.0.1:$PORT_BACKEND" NEXT_PUBLIC_APP_VERSION="$DEPLOY_VERSION" NEXT_DEPLOYMENT_ID="$DEPLOYMENT_ID" \
  pnpm turbo build --filter=@iteamify/web || BUILD_RC=$?
log_cache_sizes after
[ "$BUILD_RC" -eq 0 ] || exit "$BUILD_RC"
fi

test -f "$BUILD_ROOT/apps/web/.next/BUILD_ID"
test -f "$BUILD_ROOT/apps/web/.next/prerender-manifest.json"
test -f "$BUILD_ROOT/apps/web/.next/standalone/apps/web/server.js"

cp -a "$BUILD_ROOT/apps/web/.next/standalone/." "$WEB_RELEASE_DIR/"
install -d "$WEB_RELEASE_DIR/apps/web/.next"
cp -a "$BUILD_ROOT/apps/web/.next/static" "$WEB_RELEASE_DIR/apps/web/.next/static"
install -d "$WEB_RELEASE_DIR/_next"
ln -s ../apps/web/.next/static "$WEB_RELEASE_DIR/_next/static"
if [ -d "$BUILD_ROOT/apps/web/public" ]; then
  cp -a "$BUILD_ROOT/apps/web/public" "$WEB_RELEASE_DIR/apps/web/public"
fi
printf 'release=%s\nkind=web\ndeployment_id=%s\ncommit=%s\nversion=%s\nbuilt_at=%s\nbackend_release=%s\n' \
  "$RELEASE_ID" "$DEPLOYMENT_ID" "$DEPLOY_COMMIT" "$DEPLOY_VERSION" "$DEPLOY_DATE" "$SERVER_RELEASE" \
  >"$WEB_RELEASE_DIR/manifest"

echo "前端 standalone 冒烟测试：自动选择空闲回环端口"
if ! REMOTE_API_URL="http://127.0.0.1:$PORT_BACKEND" ITEAMIFY_APP_URL="$ITEAMIFY_APP_URL" \
  python3 "$WEB_HELPER" smoke "$WEB_RELEASE_DIR" "$DEPLOYMENT_ID" \
    --log "/tmp/aurocreator-web-smoke-$RELEASE_ID.log"; then
  if [ -f "/tmp/aurocreator-web-smoke-$RELEASE_ID.log" ]; then
    tail -n 100 "/tmp/aurocreator-web-smoke-$RELEASE_ID.log" >&2
  fi
  exit 1
fi

# Seed retained builds before pruning runtime releases. Fixed BUILD_ID metadata
# stays in its own deployment archive; only immutable files are shared.
for candidate in "$WEB_RELEASE_ROOT"/* "$PREVIOUS_WEB"; do
  [ -d "$candidate/apps/web/.next/static" ] || continue
  python3 "$WEB_HELPER" publish "$WEB_ASSETS" "$candidate"
done
if sudo test -f /etc/nginx/sites-available/aurocreator.conf; then
  sudo python3 "$WEB_HELPER" nginx "$WEB_ASSETS" /etc/nginx/sites-available/aurocreator.conf --validate
  sudo nginx -t
  sudo systemctl reload nginx
fi

# Any failure after changing the systemd runtime target must trigger a web rollback.
ACTIVATED=1
if sudo test -f "$WEB_ENV"; then
  sudo cp -a -- "$WEB_ENV" "$WEB_ENV_BACKUP"
  WEB_ENV_EXISTED=1
fi
if sudo test -f "$WEB_UNIT"; then
  sudo cp -a -- "$WEB_UNIT" "$WEB_UNIT_BACKUP"
  WEB_UNIT_EXISTED=1
fi
RUNTIME_BACKUP_CREATED=1

sudo install -d -m 0755 /etc/aurocreator
sudo touch "$WEB_ENV"
upsert_web_env() {
  local key="$1"
  local value="$2"
  if sudo grep -q "^${key}=" "$WEB_ENV"; then
    sudo sed -i "s|^${key}=.*|${key}=${value}|" "$WEB_ENV"
  else
    printf '%s=%s\n' "$key" "$value" | sudo tee -a "$WEB_ENV" >/dev/null
  fi
}
upsert_web_env HOSTNAME 127.0.0.1
upsert_web_env PORT "$PORT_NEXT"
upsert_web_env REMOTE_API_URL "http://127.0.0.1:$PORT_BACKEND"
sudo chmod 600 "$WEB_ENV"

sudo tee "$WEB_UNIT" >/dev/null <<UNIT
[Unit]
Description=Auro Web (Next.js standalone)
After=network-online.target aurocreator-backend.service
Wants=network-online.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$WEB_CURRENT
EnvironmentFile=/etc/aurocreator/web.env
Environment=ITEAMIFY_APP_URL=$ITEAMIFY_APP_URL
Environment=HOSTNAME=127.0.0.1
Environment=PORT=$PORT_NEXT
ExecStart=/usr/bin/node apps/web/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

sudo ln -sfn "$WEB_RELEASE_DIR" "$WEB_CURRENT.new"
sudo mv -Tf "$WEB_CURRENT.new" "$WEB_CURRENT"
sudo systemctl daemon-reload
sudo systemctl enable aurocreator-web >/dev/null
sudo systemctl restart aurocreator-web
if ! wait_http "http://127.0.0.1:$PORT_NEXT" 90; then
  sudo journalctl -u aurocreator-web -n 120 --no-pager >&2 || true
  exit 1
fi
WEB_PID="$(sudo systemctl show aurocreator-web -p MainPID --value)"
sudo python3 "$WEB_HELPER" verify "http://127.0.0.1:$PORT_NEXT/" "$DEPLOYMENT_ID" \
  --pid "$WEB_PID" --cwd "$WEB_RELEASE_DIR/apps/web"
if sudo test -f /etc/nginx/sites-available/aurocreator.conf; then
  python3 "$WEB_HELPER" verify-assets "$WEB_ASSETS" "$ITEAMIFY_APP_URL/"
fi
if [ -n "$PREVIOUS_WEB_PORT" ] && [ "$PREVIOUS_WEB_PORT" != "$PORT_NEXT" ] &&
   sudo test -f /etc/nginx/sites-available/aurocreator.conf; then
  sudo sed -i \
    "s#127.0.0.1:${PREVIOUS_WEB_PORT}#127.0.0.1:${PORT_NEXT}#g" \
    /etc/nginx/sites-available/aurocreator.conf
  sudo nginx -t
  sudo systemctl reload nginx
fi
if ! wait_http "$ITEAMIFY_APP_URL" 30; then
  echo "正式域名检查失败，回滚未通过验收的 Web release：$ITEAMIFY_APP_URL" >&2
  exit 1
fi
python3 "$WEB_HELPER" verify "$ITEAMIFY_APP_URL/" "$DEPLOYMENT_ID"

curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$PORT_BACKEND/readyz" >/dev/null
BACKEND_PID_AFTER="$(sudo systemctl show aurocreator-backend -p MainPID --value)"
DAEMON_PID_AFTER="$(sudo systemctl show aurocreator-daemon -p MainPID --value 2>/dev/null || echo 0)"
CLI_TARGET_AFTER="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
LEGACY_CURRENT_AFTER="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
SERVER_RELEASE_AFTER=""
if [ -L "$REMOTE_DIR/server-current" ]; then
  SERVER_RELEASE_AFTER="$(readlink -f "$REMOTE_DIR/server-current")"
else
  SERVER_RELEASE_AFTER="$LEGACY_CURRENT_AFTER"
fi
test "$BACKEND_PID_AFTER" = "$BACKEND_PID_BEFORE"
test "$DAEMON_PID_AFTER" = "$DAEMON_PID_BEFORE"
test "$CLI_TARGET_AFTER" = "$CLI_TARGET_BEFORE"
test "$LEGACY_CURRENT_AFTER" = "$LEGACY_CURRENT_BEFORE"
test "$SERVER_RELEASE_AFTER" = "$SERVER_RELEASE_BEFORE"

touch "$WEB_RELEASE_DIR/.activated"
rm -f -- "$WEB_RELEASE_DIR/.failed"
sudo rm -f -- "$WEB_ENV_BACKUP" "$WEB_UNIT_BACKUP"
ACTIVATED=0
trap - EXIT

CURRENT_WEB="$(readlink -f "$WEB_CURRENT")"
mapfile -t WEB_RELEASES < <(find "$WEB_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
ROLLBACK_SLOTS=$((RELEASE_KEEP > 0 ? RELEASE_KEEP - 1 : 0))
KEPT_ROLLBACKS=0
for OLD_RELEASE in "${WEB_RELEASES[@]}"; do
  [ "$OLD_RELEASE" = "$CURRENT_WEB" ] && continue
  case "$OLD_RELEASE" in
    "$WEB_RELEASE_ROOT"/*)
      if [ ! -f "$OLD_RELEASE/.failed" ] && managed_web_release_complete "$OLD_RELEASE" && \
         [ "$KEPT_ROLLBACKS" -lt "$ROLLBACK_SLOTS" ]; then
        KEPT_ROLLBACKS=$((KEPT_ROLLBACKS + 1))
      else
        rm -rf -- "$OLD_RELEASE"
      fi
      ;;
  esac
done

python3 "$WEB_HELPER" prune "$WEB_ASSETS" "$DEPLOYMENT_ID" --keep "$WEB_ASSET_KEEP" --days "$WEB_ASSET_DAYS"
if sudo test -f /etc/nginx/sites-available/aurocreator.conf; then
  sudo python3 "$WEB_HELPER" nginx "$WEB_ASSETS" /etc/nginx/sites-available/aurocreator.conf --validate
  sudo nginx -t
  sudo systemctl reload nginx
fi

TURBO_CACHE_DIR="$BUILD_ROOT/.turbo/cache"
if [ -d "$TURBO_CACHE_DIR" ]; then
  mapfile -t TURBO_HASHES < <(
    find "$TURBO_CACHE_DIR" -maxdepth 1 -type f -name '*-meta.json' -printf '%T@ %f\n' \
      | sort -rn | sed -E 's/^[^ ]+ ([0-9a-f]{16})-meta\.json$/\1/'
  )
  if [ "${#TURBO_HASHES[@]}" -gt "$TURBO_CACHE_KEEP" ]; then
    for CACHE_HASH in "${TURBO_HASHES[@]:$TURBO_CACHE_KEEP}"; do
      [[ "$CACHE_HASH" =~ ^[0-9a-f]{16}$ ]] || continue
      rm -f -- "$TURBO_CACHE_DIR/${CACHE_HASH}"*
    done
  fi
fi

NEXT_CACHE_DIR="$BUILD_ROOT/apps/web/.next/cache"
NEXT_CACHE_MB="$(du -sm "$NEXT_CACHE_DIR" 2>/dev/null | awk '{print $1}' || true)"
NEXT_CACHE_MB="${NEXT_CACHE_MB:-0}"
if [ "$NEXT_CACHE_MB" -gt "$NEXT_CACHE_MAX_MB" ]; then
  echo "WARNING: Next cache ${NEXT_CACHE_MB}MB 超过预算 ${NEXT_CACHE_MAX_MB}MB；保留缓存，请依据各构建器用量安排清理"
fi

echo "web_release=$RELEASE_ID"
echo "backend_pid_unchanged=$BACKEND_PID_AFTER"
echo "daemon_pid_unchanged=$DAEMON_PID_AFTER"
echo "deploy_log=$DEPLOY_LOG"
du -sh "$WEB_RELEASE_DIR" "$NEXT_CACHE_DIR" 2>/dev/null || true
REMOTE
  ok "前端 release 已激活: $RELEASE_ID"
}

phase_verify_web() {
  log "web verify: 前端 release、服务和后端隔离状态"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_USER PORT_BACKEND PORT_NEXT <<'REMOTE'
set -Eeuo pipefail
sudo systemctl is-active aurocreator-backend aurocreator-web
WEB_TARGET="$(readlink -f "$REMOTE_DIR/web-current")"
case "$WEB_TARGET" in
  "$REMOTE_DIR"/web-releases/*) ;;
  *) echo "web-current 不在 web-releases 内：$WEB_TARGET" >&2; exit 1 ;;
esac
test -f "$WEB_TARGET/apps/web/server.js"
test -s "$WEB_TARGET/manifest"
grep -Fxq 'kind=web' "$WEB_TARGET/manifest"
# The runtime artifact identity is the manifest's deployment_id (source
# fingerprint), not the release directory name.
DEPLOYMENT_ID="$(awk -F= '$1 == "deployment_id" {print $2; exit}' "$WEB_TARGET/manifest")"
test -n "$DEPLOYMENT_ID"
test "$(sudo systemctl show aurocreator-web -p WorkingDirectory --value)" = "$REMOTE_DIR/web-current"
sudo systemctl cat aurocreator-web | grep -Fq "Environment=PORT=$PORT_NEXT"
if [ -L "$REMOTE_DIR/server-current" ]; then
  SERVER_TARGET="$(readlink -f "$REMOTE_DIR/server-current")"
else
  SERVER_TARGET="$(readlink -f "$REMOTE_DIR/current")"
fi
echo "web_current=$WEB_TARGET"
cat "$WEB_TARGET/manifest"
echo "server_current=$SERVER_TARGET"
echo "backend_pid=$(sudo systemctl show aurocreator-backend -p MainPID --value)"
echo "daemon_pid=$(sudo systemctl show aurocreator-daemon -p MainPID --value 2>/dev/null || echo 0)"
curl --fail --silent --show-error "http://127.0.0.1:$PORT_BACKEND/readyz"
echo
WEB_PID="$(sudo systemctl show aurocreator-web -p MainPID --value)"
sudo python3 "$REMOTE_DIR/build/deploy/web-release.py" verify "http://127.0.0.1:$PORT_NEXT/" "$DEPLOYMENT_ID" \
  --pid "$WEB_PID" --cwd "$WEB_TARGET/apps/web"
echo "web_deployment_id=$DEPLOYMENT_ID"
REMOTE

  # The public-domain check must use the same artifact identity that the
  # running web-current manifest declares.
  local deployment_id
  deployment_id="$(ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
WEB_TARGET="$(readlink -f "$REMOTE_DIR/web-current")"
awk -F= '$1 == "deployment_id" && $2 != "" {print $2; exit}' "$WEB_TARGET/manifest"
REMOTE
)"
  case "$deployment_id" in
    ""|*[!A-Za-z0-9_-]*)
      err "web manifest 缺少有效的 deployment_id: '$deployment_id'"
      return 1
      ;;
  esac

  log "web verify: 正式域名 HTTPS"
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL/healthz" >/dev/null
  python3 "$SCRIPT_DIR/deploy/aurocreator/web-release.py" verify "$ITEAMIFY_APP_URL/" "$deployment_id"
  ok "$ITEAMIFY_APP_URL 前端发布验证通过"
}
