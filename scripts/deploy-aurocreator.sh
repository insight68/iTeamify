#!/usr/bin/env bash
# Auro 原生部署脚本（aurocreator 实例，Ubuntu + systemd，无 Docker）
#
# Default deployment runs the server, web, and daemon component pipelines in
# sequence under component locks. Each component owns its release family, current
# pointer, activation check, and rollback boundary. Database migrations remain
# forward-only, so a later component failure does not roll back an already
# healthy server release or its migrations.
# Production daemon self-update is disabled; this script owns its lifecycle so
# every daemon process remains under systemd supervision.
# Infrastructure bootstrap and hardening are intentionally separate operations.
#
# 目标服务器 auro（需在 ~/.ssh/config 配置 Host auro），远端目录 /opt/aurocreator，nginx 反向代理。
# PostgreSQL 须已在目标主机安装；本脚本只建库。
#
# 用法：
#   ./scripts/deploy-aurocreator.sh              # 安全发布（等同 deploy）
#   ./scripts/deploy-aurocreator.sh deploy       # 安全发布
#   ./scripts/deploy-aurocreator.sh web          # Build and deploy only the Next.js frontend
#   RELEASE_ID=... ./scripts/deploy-aurocreator.sh web-status # Inspect a server-owned Web job
#   RELEASE_ID=... ./scripts/deploy-aurocreator.sh web-wait # Reconnect without starting a new job
#   RELEASE_ID=... ./scripts/deploy-aurocreator.sh deploy-status # Inspect all component stages
#   RELEASE_ID=... ./scripts/deploy-aurocreator.sh deploy-resume # Finish the uploaded full release
#   ./scripts/deploy-aurocreator.sh server       # Build/deploy the Go backend + migrate
#   ./scripts/deploy-aurocreator.sh daemon       # Build and deploy only the daemon/CLI/MCP runtime
#   ./scripts/deploy-aurocreator.sh config       # Sync/build/install only the production config compiler
#   ./scripts/deploy-aurocreator.sh preflight-server # 只读检查 Server-only 发布前置条件
#   ./scripts/deploy-aurocreator.sh bootstrap    # 在已安装的 PostgreSQL 上创建 aurocreator 库/用户/扩展
#   ./scripts/deploy-aurocreator.sh harden       # 配置 nginx + Let's Encrypt 并收紧防火墙
#   ./scripts/deploy-aurocreator.sh prune        # 清理旧部署产物并收敛构建缓存
#   ./scripts/deploy-aurocreator.sh verify       # 只读验证
#   ./scripts/deploy-aurocreator.sh unlock       # 确认无构建进程后清理陈旧部署锁
#
# 机密管理：仓库 .env 永不上传。RESEND_API_KEY 仅由服务器上的
# /etc/aurocreator/backend.env 管理，脚本不会从本机读取、传输或硬编码该 Key。

set -Eeuo pipefail

# ============ 配置 ============
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOCAL_DIR="${LOCAL_DIR:-$PROJECT_ROOT}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$LOCAL_DIR/.env}"

load_public_env_value() {
  local key="$1"
  local value
  value="$(awk -v key="$key" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=" {
      sub("^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=[[:space:]]*", "")
      value = $0
    }
    END { printf "%s", value }
  ' "$DEPLOY_ENV_FILE")"
  value="${value%$'\r'}"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

# 只允许从本地 .env 读取非机密的正式站点 URL。
if [ -f "$DEPLOY_ENV_FILE" ] && [ -z "${ITEAMIFY_APP_URL+x}" ]; then
  ITEAMIFY_APP_URL="$(load_public_env_value ITEAMIFY_APP_URL)"
fi

SSH_KEY="${SSH_KEY:-}"
SSH_HOST="${SSH_HOST:-auro}"
REMOTE_DIR="${REMOTE_DIR:-/opt/aurocreator}"
PUBLIC_IP="${PUBLIC_IP:-}"
PORT_BACKEND="${PORT_BACKEND:-8080}"
PORT_DB="${PORT_DB:-5432}"
PORT_NEXT="${PORT_NEXT:-3000}"
GO_VERSION="${GO_VERSION:-1.26.1}"
GOARCH="${GOARCH:-}"
PNPM_VERSION="${PNPM_VERSION:-$(sed -nE 's/^[[:space:]]*"packageManager":[[:space:]]*"pnpm@([^"]+)".*/\1/p' "$LOCAL_DIR/package.json")}"
ITEAMIFY_APP_URL="${ITEAMIFY_APP_URL:-https://aurocreator.com}"
ITEAMIFY_APP_URL="${ITEAMIFY_APP_URL%/}"
# aurocreator.com and aurosignal.com are both official browser origins while the
# site migrates to aurosignal.com; the apex and www hostnames of each serve the
# same public site. Public mutation handlers intentionally require an exact
# Origin match, so keep every official browser origin in the default allowlist
# without weakening that protection for arbitrary subdomains. Once the migration
# is complete, drop the aurocreator.com entries here.
case "$ITEAMIFY_APP_URL" in
  https://aurocreator.com|https://www.aurocreator.com|https://aurosignal.com|https://www.aurosignal.com)
    DEFAULT_CORS_ALLOWED_ORIGINS="https://aurocreator.com,https://www.aurocreator.com,https://aurosignal.com,https://www.aurosignal.com"
    ;;
  *)
    DEFAULT_CORS_ALLOWED_ORIGINS="$ITEAMIFY_APP_URL"
    ;;
esac
ITEAMIFY_CORS_ALLOWED_ORIGINS="${ITEAMIFY_CORS_ALLOWED_ORIGINS:-$DEFAULT_CORS_ALLOWED_ORIGINS}"
# The Oracle deployment serves its API under the public app origin. Keep this
# separate so a future split API hostname can be rolled out without changing
# the frontend URL or relying on the CLI's hosted-cloud default.
ITEAMIFY_DAEMON_SERVER_URL="${ITEAMIFY_DAEMON_SERVER_URL:-$ITEAMIFY_APP_URL}"
RELEASE_KEEP="${RELEASE_KEEP:-3}"
WEB_ASSET_KEEP="${WEB_ASSET_KEEP:-3}"
WEB_ASSET_DAYS="${WEB_ASSET_DAYS:-14}"
WEB_REUSE_BUILD="${WEB_REUSE_BUILD:-0}"
WEB_RETRY_BUILD="${WEB_RETRY_BUILD:-0}"
if [ "$WEB_RETRY_BUILD" != 0 ] && [ "$WEB_RETRY_BUILD" != 1 ]; then
  printf 'Invalid WEB_RETRY_BUILD: use 0 or 1\n' >&2
  exit 1
fi
if [ "$WEB_RETRY_BUILD" = 1 ] && { [ -z "${RELEASE_ID:-}" ] || [ "${1:-deploy}" != web ] || [ "$WEB_REUSE_BUILD" = 1 ]; }; then
  printf 'WEB_RETRY_BUILD=1 requires an explicit RELEASE_ID, the web phase and WEB_REUSE_BUILD=0\n' >&2
  exit 1
fi
case "${1:-deploy}" in
  web-wait|web-status|deploy-status|deploy-resume)
    [ -n "${RELEASE_ID:-}" ] || { printf 'An explicit RELEASE_ID is required for status/wait/resume\n' >&2; exit 1; }
    ;;
esac
if [ "$WEB_REUSE_BUILD" != 0 ] && [ "$WEB_REUSE_BUILD" != 1 ]; then
  printf 'Invalid WEB_REUSE_BUILD: use 0 or 1\n' >&2
  exit 1
fi
if [ "$WEB_REUSE_BUILD" = 1 ] && { [ -z "${RELEASE_ID:-}" ] || [ "${1:-deploy}" != web ]; }; then
  printf 'WEB_REUSE_BUILD=1 requires an explicit RELEASE_ID and the web phase\n' >&2
  exit 1
fi
if ! [[ "$WEB_ASSET_KEEP" =~ ^[1-9][0-9]*$ ]] || [ "$WEB_ASSET_KEEP" -lt 3 ] ||
   ! [[ "$WEB_ASSET_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Invalid static retention: WEB_ASSET_KEEP must be at least 3 and WEB_ASSET_DAYS at least 1\n' >&2
  exit 1
fi
TURBO_CACHE_KEEP="${TURBO_CACHE_KEEP:-6}"
# Next's compiler caches are independent of Turbo's artifact cache. Budget
# warnings preserve the active compiler cache; timings come from measurements.
NEXT_CACHE_MAX_MB="${NEXT_CACHE_MAX_MB:-4096}"
INSTALL_SCOPE_VERSION="${INSTALL_SCOPE_VERSION:-web-v2-pnpm12}"
# Oracle 主机的 SSH/服务用户为 ubuntu。其他目标可显式覆盖这两个值。
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_HOME="${DEPLOY_HOME:-/home/ubuntu}"

DEPLOY_COMMIT="$(git -C "$LOCAL_DIR" rev-parse --verify HEAD 2>/dev/null || printf unknown)"
DEPLOY_VERSION="$(git -C "$LOCAL_DIR" describe --tags --always --dirty 2>/dev/null || printf dev)"
DEPLOY_DATE="${DEPLOY_DATE:-$(date -u +%FT%TZ)}"
RELEASE_SHA="${DEPLOY_COMMIT:0:12}"
if [ -n "$(git -C "$LOCAL_DIR" status --porcelain 2>/dev/null)" ]; then
  RELEASE_SHA="${RELEASE_SHA}-dirty"
fi
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_SHA}}"
if ! [[ "$RELEASE_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Invalid RELEASE_ID: use letters, digits, underscores and hyphens\n' >&2
  exit 1
fi
DEPLOY_LOCK_DIR="/run/lock/aurocreator-deploy.lock.d"
LOCK_HELD=0
SSH_CONTROL_PATH="${SSH_CONTROL_PATH:-/tmp/aurocreator-deploy-ssh-%C}"

# Deployment modules define functions only; this entrypoint owns configuration,
# cross-component verification, orchestration, and command dispatch.
source "$SCRIPT_DIR/deploy/aurocreator/common.sh"
source "$SCRIPT_DIR/deploy/aurocreator/server.sh"
source "$SCRIPT_DIR/deploy/aurocreator/web.sh"
source "$SCRIPT_DIR/deploy/aurocreator/daemon.sh"
source "$SCRIPT_DIR/deploy/aurocreator/maintenance.sh"

# ============ Component-aware verification ============
phase_verify() {
  log "verify: systemd、组件 release、数据库与本机监听"
  ssh_exec_env REMOTE_DIR DEPLOY_USER PORT_BACKEND PORT_NEXT <<'REMOTE'
set -Eeuo pipefail

read_env_file_value() {
  local file="$1" key="$2" value
  if ! value="$(sudo awk -F= -v key="$key" '
      $1 == key { count++; value = substr($0, length(key) + 2) }
      END { if (count != 1) exit 2; print value }
    ' "$file")"; then
    echo "$file 必须且只能配置一次 $key" >&2
    return 1
  fi
  printf '%s' "$value"
}

read_process_env_value() {
  local pid="$1" key="$2" value
  if ! value="$(sudo cat "/proc/$pid/environ" | tr '\0' '\n' | awk -F= -v key="$key" '
      $1 == key { count++; value = substr($0, length(key) + 2) }
      END { if (count != 1) exit 2; print value }
    ')"; then
    echo "进程 $pid 必须且只能加载一次 $key" >&2
    return 1
  fi
  printf '%s' "$value"
}


sudo systemctl is-active postgresql aurocreator-backend aurocreator-web aurocreator-daemon nginx

LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
INSTALLED_CLI="$(readlink -f /usr/local/bin/iteamify)"
test -n "$LEGACY_CURRENT"

if [ -L "$REMOTE_DIR/server-current" ]; then
  SERVER_TARGET="$(readlink -f "$REMOTE_DIR/server-current")"
  case "$SERVER_TARGET" in "$REMOTE_DIR"/server-releases/*) ;; *) exit 1 ;; esac
  SERVER_MANIFEST="$SERVER_TARGET/manifest"
  grep -Fxq 'kind=server' "$SERVER_MANIFEST"
  test "$(sudo systemctl show aurocreator-backend -p WorkingDirectory --value)" = "$REMOTE_DIR/server-current"
else
  SERVER_TARGET="$LEGACY_CURRENT"
  SERVER_MANIFEST="$LEGACY_CURRENT/manifest"
fi
test -x "$SERVER_TARGET/bin/aurocreator-backend"
test -x "$SERVER_TARGET/bin/aurocreator-migrate"
test -x "$SERVER_TARGET/bin/aurocreator-config"
test -d "$SERVER_TARGET/server/migrations"
test -s "$SERVER_MANIFEST"
grep -Fxq 'site_config_compiler=1' "$SERVER_MANIFEST"
grep -Fxq "PORT=$PORT_BACKEND" <(sudo cat /etc/aurocreator/backend.env)
grep -Fxq 'SERVER_HOST=127.0.0.1' <(sudo cat /etc/aurocreator/backend.env)
sudo systemctl cat aurocreator-backend.service | \
  grep -Fq 'EnvironmentFile=/etc/aurocreator/generated/openagent-backend.env'
sudo systemctl cat aurocreator-daemon.service | \
  grep -Fq 'EnvironmentFile=/etc/aurocreator/generated/openagent-daemon.env'
CONFIG_DIFF="$(sudo "$SERVER_TARGET/bin/aurocreator-config" diff --config /etc/aurocreator/config.yaml --credentials-dir /etc/aurocreator/credentials --output-dir /etc/aurocreator/generated)"
printf '%s\n' "$CONFIG_DIFF"
if printf '%s\n' "$CONFIG_DIFF" | awk '$1 != "unchanged" { bad=1 } END { exit bad }'; then :; else
  echo "生成的生产配置与 config.yaml/credentials 不一致" >&2
  exit 1
fi

if [ -L "$REMOTE_DIR/web-current" ]; then
  WEB_TARGET="$(readlink -f "$REMOTE_DIR/web-current")"
  case "$WEB_TARGET" in "$REMOTE_DIR"/web-releases/*) ;; *) exit 1 ;; esac
  WEB_MANIFEST="$WEB_TARGET/manifest"
  grep -Fxq 'kind=web' "$WEB_MANIFEST"
  test "$(sudo systemctl show aurocreator-web -p WorkingDirectory --value)" = "$REMOTE_DIR/web-current"
else
  WEB_TARGET="$LEGACY_CURRENT/web"
  WEB_MANIFEST="$LEGACY_CURRENT/manifest"
fi
test -f "$WEB_TARGET/apps/web/server.js"
test -s "$WEB_MANIFEST"
sudo systemctl cat aurocreator-web | grep -Fq "Environment=PORT=$PORT_NEXT"

if [ -L "$REMOTE_DIR/daemon-current" ]; then
  DAEMON_TARGET="$(readlink -f "$REMOTE_DIR/daemon-current")"
  case "$DAEMON_TARGET" in "$REMOTE_DIR"/daemon-releases/*) ;; *) exit 1 ;; esac
  DAEMON_MANIFEST="$DAEMON_TARGET/manifest"
  grep -Fxq 'kind=daemon' "$DAEMON_MANIFEST"
  sudo systemctl cat aurocreator-daemon | \
    grep -Fq "ExecStart=$REMOTE_DIR/daemon-current/iteamify daemon start --foreground"
else
  DAEMON_TARGET="$(dirname "$INSTALLED_CLI")"
  DAEMON_MANIFEST="$LEGACY_CURRENT/manifest"
fi
test -x "$DAEMON_TARGET/iteamify"
test -s "$DAEMON_MANIFEST"
test "$INSTALLED_CLI" = "$(readlink -f "$DAEMON_TARGET/iteamify")"

echo "legacy_current=$LEGACY_CURRENT"
echo "server_current=$SERVER_TARGET"
echo "web_current=$WEB_TARGET"
echo "daemon_current=$DAEMON_TARGET"
echo "server_manifest:"
cat "$SERVER_MANIFEST"
echo "web_manifest:"
cat "$WEB_MANIFEST"
echo "daemon_manifest:"
cat "$DAEMON_MANIFEST"
echo "cli:"
"$INSTALLED_CLI" version
"$INSTALLED_CLI" mcp serve --help >/dev/null
echo "installed_cli=$INSTALLED_CLI"
curl --fail --silent --show-error "http://127.0.0.1:$PORT_BACKEND/readyz"
echo
curl --fail --silent --show-error --output /dev/null "http://127.0.0.1:$PORT_NEXT"
PW="$(sudo cat /etc/aurocreator/.pgpass)"
PGPASSWORD="$PW" psql "postgres://aurocreator@127.0.0.1:5432/aurocreator?sslmode=disable" \
  -X -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM schema_migrations;'
OPENAGENT_ENABLED="$(read_env_file_value /etc/aurocreator/generated/openagent-backend.env ITEAMIFY_OPENAGENT_ENABLED)"
MANAGED_PROVIDER=""
MANAGED_RUNTIME_EXPECTATIONS=""
if [ "$OPENAGENT_ENABLED" = "true" ]; then
  assert_managed_identity_loaded() {
    local unit="$1" file="$2" pid expected_id expected_token effective_id effective_token
    pid="$(sudo systemctl show "$unit" -p MainPID --value)"
    expected_id="$(read_env_file_value "$file" ITEAMIFY_MANAGED_DAEMON_ID)"
    expected_token="$(read_env_file_value "$file" ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
    effective_id="$(read_process_env_value "$pid" ITEAMIFY_MANAGED_DAEMON_ID)"
    effective_token="$(read_process_env_value "$pid" ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
    if [ -z "$expected_id" ] || [ "${#expected_token}" -lt 32 ]; then
      echo "$file 中 managed daemon 身份缺失或长度不合法" >&2
      return 1
    fi
    if [ "$effective_id" != "$expected_id" ] || [ "$effective_token" != "$expected_token" ]; then
      echo "$unit 尚未加载 $file 中的 managed daemon 身份" >&2
      return 1
    fi
  }
  assert_managed_identity_loaded aurocreator-backend /etc/aurocreator/generated/openagent-backend.env
  assert_managed_identity_loaded aurocreator-daemon /etc/aurocreator/generated/openagent-daemon.env
  MANAGED_PROVIDER=openagent
  MANAGED_RUNTIME_EXPECTATIONS="$(PGPASSWORD="$PW" psql "postgres://aurocreator@127.0.0.1:5432/aurocreator?sslmode=disable" -X -v ON_ERROR_STOP=1 -F '|' -tAc "SELECT id::text, 'openagent' FROM workspace ORDER BY id;")"
  echo "openagent_identity_ready=true"
elif [ "$OPENAGENT_ENABLED" != "false" ]; then
  echo "OpenAgent enable flag is missing" >&2
  exit 1
fi
echo "listeners:"
sudo ss -tlnp | grep -E ":(5432|$PORT_BACKEND|$PORT_NEXT)([[:space:]]|$)" || true
echo "daemon:"
sudo systemctl is-enabled aurocreator-daemon
DAEMON_HEALTH="$(curl --fail --silent --show-error http://127.0.0.1:19514/health)"
printf '%s' "$DAEMON_HEALTH" | python3 -c '
import json, sys
health = json.load(sys.stdin)
if health.get("status") != "running":
    raise SystemExit("daemon status is {!r}, want running".format(health.get("status")))
if health.get("supervisor") != "systemd":
    raise SystemExit("daemon supervisor is {!r}, want systemd".format(health.get("supervisor")))
if health.get("active_task_count") is None:
    raise SystemExit("daemon health omits active_task_count")
discovered = {item for item in (health.get("agents") or []) if isinstance(item, str) and item}
provider = sys.argv[1]
if provider and provider not in discovered:
    raise SystemExit("managed runtime provider {} is unavailable; registered providers: {}".format(provider, ", ".join(sorted(discovered))))
workspaces = {workspace.get("id"): workspace for workspace in (health.get("workspaces") or [])}
expected_by_workspace = {}
for line in sys.argv[2].splitlines():
    workspace_id, expected_provider = line.split("|", 1)
    expected_by_workspace.setdefault(workspace_id, set()).add(expected_provider)
for workspace_id, expected in expected_by_workspace.items():
    workspace = workspaces.get(workspace_id)
    if workspace is None:
        raise SystemExit("managed workspace {} is missing from daemon health".format(workspace_id))
    registered = {item for item in workspace.get("registered_agents", []) if isinstance(item, str) and item}
    missing = sorted(expected - registered)
    if missing:
        raise SystemExit("managed workspace {} missing registered agents: {}".format(workspace_id, ", ".join(missing)))
' "$MANAGED_PROVIDER" "$MANAGED_RUNTIME_EXPECTATIONS"
printf '%s\n' "$DAEMON_HEALTH"
REMOTE

  log "verify: 正式域名 HTTPS"
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL/healthz" >/dev/null
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL" >/dev/null
  ok "$ITEAMIFY_APP_URL 前后端均可访问"
}


phase_deploy() {
  phase_check_web_sources
  phase_preflight
  phase_site_config_schema_preflight
  acquire_deploy_lock
  phase_sync_go
  phase_sync_web
  # 本机交叉编译所有 Go 二进制（CGO=0, linux/amd64），打包上传后远端只做解包+migrate+activate。
  # 目标主机内存受限时，远端原生 go build 必触发 OOM Killer 杀掉 sshd。
  build_server_binaries_local
  build_daemon_binaries_local
  upload_release_artifacts "$BUILD_TMP/server.tar.gz" "$BUILD_TMP/daemon.tar.gz"
  record_deploy_scope deploy
  # The server-owned web job releases the lock at completion. Reacquire before
  # the next component; a concurrent deployment makes this step fail closed.
  phase_build_server_activate
  phase_build_web_activate
  acquire_deploy_lock
  phase_build_daemon_activate
  phase_verify
  phase_deploy_status
  release_deploy_lock
}

phase_server() {
  phase_preflight
  phase_site_config_schema_preflight
  phase_managed_daemon_environment_preflight
  acquire_deploy_lock
  phase_sync_go
  build_server_binaries_local
  upload_release_artifacts "$BUILD_TMP/server.tar.gz"
  phase_build_server_activate
  release_deploy_lock
  phase_verify_server
}

phase_preflight_server() {
  phase_preflight
  phase_site_config_schema_preflight
  phase_managed_daemon_environment_preflight
}

phase_web() {
  if [ "$WEB_REUSE_BUILD" = 0 ]; then
    phase_check_web_sources
  fi
  phase_preflight
  acquire_deploy_lock
  if [ "$WEB_REUSE_BUILD" = 1 ]; then
    phase_sync_web_helper
  else
    phase_sync_web
  fi
  record_deploy_scope web
  phase_build_web_activate
  release_deploy_lock
  phase_verify_web
}

phase_daemon() {
  phase_preflight
  acquire_deploy_lock
  phase_sync_go
  build_daemon_binaries_local
  upload_release_artifacts "$BUILD_TMP/daemon.tar.gz"
  phase_build_daemon_activate
  release_deploy_lock
  phase_verify_daemon
}

phase_config() {
  phase_preflight
  acquire_deploy_lock
  phase_sync_go
  phase_install_site_config_tool
  release_deploy_lock
}

# ============ main ============
PHASE="${1:-deploy}"
log "开始: phase=$PHASE target=$SSH_HOST url=$ITEAMIFY_APP_URL release=$RELEASE_ID"

case "$PHASE" in
  deploy|all) phase_deploy ;;
  web)         phase_web ;;
  web-status)  phase_web_status ;;
  web-wait)    phase_web_wait; phase_deploy_status ;;
  deploy-status) phase_deploy_status ;;
  deploy-resume) phase_deploy_resume ;;
  server)      phase_server ;;
  daemon)      phase_daemon ;;
  config)      phase_config ;;
  preflight)  phase_preflight ;;
  preflight-server) phase_preflight_server ;;
  bootstrap)  phase_bootstrap ;;
  harden)     phase_harden ;;
  prune)      phase_prune ;;
  verify)     phase_verify ;;
  unlock)     phase_unlock ;;
  *)
    err "未知阶段: $PHASE"
    echo "用法: $0 [deploy|deploy-status|deploy-resume|server|web|web-status|web-wait|daemon|config|preflight|preflight-server|bootstrap|harden|prune|verify|unlock]"
    exit 1
    ;;
esac

ok "完成: $PHASE"
