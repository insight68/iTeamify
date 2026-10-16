#!/usr/bin/env bash
# Auro 原生部署脚本（Ubuntu + systemd，无 Docker）
#
# Default deployment runs the server, web, and daemon component pipelines in
# sequence under one lock. Each component owns its release family, current
# pointer, activation check, and rollback boundary. Database migrations remain
# forward-only, so a later component failure does not roll back an already
# healthy server release or its migrations.
# Production daemon self-update is disabled; this script owns its lifecycle so
# every daemon process remains under systemd supervision.
# Infrastructure bootstrap and hardening are intentionally separate operations.
#
# 用法：
#   ./scripts/deploy.sh              # 安全发布（等同 deploy）
#   ./scripts/deploy.sh deploy       # 安全发布
#   ./scripts/deploy.sh web          # Build and deploy only the Next.js frontend
#   ./scripts/deploy.sh server       # Build/deploy the Go backend + migrate
#   ./scripts/deploy.sh daemon       # Build and deploy only the daemon/CLI/MCP runtime
#   ./scripts/deploy.sh config       # Sync/build/install only the production config compiler
#   ./scripts/deploy.sh bootstrap    # 首次安装 PostgreSQL（仅本机监听）
#   ./scripts/deploy.sh harden       # 收紧 PostgreSQL/Caddy/防火墙
#   ./scripts/deploy.sh prune        # 清理旧部署产物并收敛构建缓存
#   ./scripts/deploy.sh verify       # 只读验证
#   ./scripts/deploy.sh unlock       # 确认无构建进程后清理陈旧部署锁
#
# 机密管理：仓库 .env 永不上传。RESEND_API_KEY 仅由服务器上的
# /etc/iteamify/backend.env 管理，脚本不会从本机读取、传输或硬编码该 Key。

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

SSH_KEY="${SSH_KEY:-/Users/chunjun/.ssh/tecent_key}"
SSH_HOST="${SSH_HOST:-ubuntu@106.54.235.89}"
REMOTE_DIR="${REMOTE_DIR:-/opt/iteamify}"
PUBLIC_IP="${PUBLIC_IP:-106.54.235.89}"
PORT_BACKEND="${PORT_BACKEND:-8080}"
PORT_DB="${PORT_DB:-5432}"
PORT_NEXT="${PORT_NEXT:-3000}"
GO_VERSION="${GO_VERSION:-1.26.1}"
PNPM_VERSION="${PNPM_VERSION:-$(sed -nE 's/^[[:space:]]*"packageManager":[[:space:]]*"pnpm@([^"]+)".*/\1/p' "$LOCAL_DIR/package.json")}"
ITEAMIFY_APP_URL="${ITEAMIFY_APP_URL:-https://aurocreator.com}"
RELEASE_KEEP="${RELEASE_KEEP:-3}"
TURBO_CACHE_KEEP="${TURBO_CACHE_KEEP:-6}"
NEXT_CACHE_MAX_MB="${NEXT_CACHE_MAX_MB:-2560}"
# Bump when the install scope or node_modules format changes.
INSTALL_SCOPE_VERSION="${INSTALL_SCOPE_VERSION:-web-v2-pnpm12}"

DEPLOY_COMMIT="$(git -C "$LOCAL_DIR" rev-parse --verify HEAD 2>/dev/null || printf unknown)"
DEPLOY_VERSION="$(git -C "$LOCAL_DIR" describe --tags --always --dirty 2>/dev/null || printf dev)"
DEPLOY_DATE="${DEPLOY_DATE:-$(date -u +%FT%TZ)}"
RELEASE_SHA="${DEPLOY_COMMIT:0:12}"
if [ -n "$(git -C "$LOCAL_DIR" status --porcelain 2>/dev/null)" ]; then
  RELEASE_SHA="${RELEASE_SHA}-dirty"
fi
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_SHA}}"
DEPLOY_LOCK_DIR="/run/lock/iteamify-deploy.lock.d"
LOCK_HELD=0

# ============ 日志 ============
log()  { printf '\033[36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[32m[%s] ✓ %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[33m[%s] ! %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
err()  { printf '\033[31m[%s] ✗ %s\033[0m\n' "$(date +%H:%M:%S)" "$*" >&2; }

# ============ SSH / rsync ============
ssh_run() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$SSH_HOST" "$@"
}

ssh_exec() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$SSH_HOST" "bash -s"
}

# 变量经 SSH 标准输入传递，不出现在远端进程参数中。
ssh_exec_env() {
  local var_name
  {
    for var_name in "$@"; do
      printf 'export %s=%q\n' "$var_name" "${!var_name}"
    done
    cat
  } | ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$SSH_HOST" "bash -s"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [ "$LOCK_HELD" -eq 1 ]; then
    warn "释放部署锁"
    ssh_exec_env DEPLOY_LOCK_DIR RELEASE_ID <<'REMOTE' >/dev/null 2>&1 || true
set -Eeuo pipefail
if sudo test -f "$DEPLOY_LOCK_DIR/owner" && sudo grep -Fxq "$RELEASE_ID" "$DEPLOY_LOCK_DIR/owner"; then
  sudo rm -f -- "$DEPLOY_LOCK_DIR/owner"
  sudo rmdir -- "$DEPLOY_LOCK_DIR"
fi
REMOTE
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

acquire_deploy_lock() {
  log "lock: 获取服务器部署互斥锁"
  if ! ssh_exec_env DEPLOY_LOCK_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
if sudo mkdir "$DEPLOY_LOCK_DIR" 2>/dev/null; then
  printf '%s\n' "$RELEASE_ID" | sudo tee "$DEPLOY_LOCK_DIR/owner" >/dev/null
  sudo chmod 644 "$DEPLOY_LOCK_DIR/owner"
  exit 0
fi
echo "已有部署正在运行或留下了陈旧锁：" >&2
sudo cat "$DEPLOY_LOCK_DIR/owner" 2>/dev/null >&2 || true
exit 73
REMOTE
  then
    err "无法获取部署锁。若确认没有部署/构建进程，执行：$0 unlock"
    return 73
  fi
  LOCK_HELD=1
  ok "部署锁已获取: $RELEASE_ID"
}

release_deploy_lock() {
  [ "$LOCK_HELD" -eq 1 ] || return 0
  ssh_exec_env DEPLOY_LOCK_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
if sudo test -f "$DEPLOY_LOCK_DIR/owner" && sudo grep -Fxq "$RELEASE_ID" "$DEPLOY_LOCK_DIR/owner"; then
  sudo rm -f -- "$DEPLOY_LOCK_DIR/owner"
  sudo rmdir -- "$DEPLOY_LOCK_DIR"
fi
REMOTE
  LOCK_HELD=0
  ok "部署锁已释放"
}

# ============ preflight ============
phase_preflight() {
  log "preflight: 检查本地文件、SSH 和服务器容量"
  [ -f "$LOCAL_DIR/pnpm-lock.yaml" ] || { err "找不到 pnpm-lock.yaml: $LOCAL_DIR"; return 1; }
  [ -f "$LOCAL_DIR/server/go.mod" ] || { err "找不到 server/go.mod: $LOCAL_DIR"; return 1; }
  [ -r "$SSH_KEY" ] || { err "SSH Key 不可读: $SSH_KEY"; return 1; }
  ssh_run 'set -Eeuo pipefail; printf "connected: "; lsb_release -ds 2>/dev/null || true; printf "cpu=%s ram=%s disk_free=%s\n" "$(nproc)" "$(free -h | awk '\''/Mem:/{print $2}'\'')" "$(df -h / | awk '\''NR==2{print $4}'\'')"; command -v rsync >/dev/null; command -v node >/dev/null'
  ok "preflight 完成"
}

# ============ 首次数据库初始化（不属于普通发布） ============
phase_bootstrap() {
  log "bootstrap: 安装 PostgreSQL 17 + pgvector，并限制为本机访问"
  ssh_exec <<'REMOTE'
set -Eeuo pipefail

if ! command -v psql >/dev/null || ! psql --version | grep -q "17"; then
  sudo install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-17 postgresql-17-pgvector postgresql-contrib
fi
sudo systemctl enable --now postgresql >/dev/null
sudo install -d -m 700 /etc/iteamify

if ! sudo test -s /etc/iteamify/.pgpass; then
  openssl rand -hex 24 | sudo tee /etc/iteamify/.pgpass >/dev/null
  sudo chmod 600 /etc/iteamify/.pgpass
fi
if ! sudo test -s /etc/iteamify/.jwt; then
  openssl rand -hex 32 | sudo tee /etc/iteamify/.jwt >/dev/null
  sudo chmod 600 /etc/iteamify/.jwt
fi
PW="$(sudo cat /etc/iteamify/.pgpass)"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='iteamify'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER iteamify WITH PASSWORD '$PW'"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='iteamify'" | grep -q 1 \
  || sudo -u postgres createdb -O iteamify iteamify
sudo -u postgres psql -c "ALTER USER iteamify WITH PASSWORD '$PW'" >/dev/null
sudo -u postgres psql -d iteamify -c "CREATE EXTENSION IF NOT EXISTS vector"
sudo -u postgres psql -d iteamify -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
sudo -u postgres psql -d iteamify -c "CREATE EXTENSION IF NOT EXISTS btree_gin"

CONF_FILE="$(sudo -u postgres psql -tAc 'SHOW config_file' | xargs)"
HBA_FILE="$(sudo -u postgres psql -tAc 'SHOW hba_file' | xargs)"
sudo sed -i '/# >>> iteamify >>>/,/# <<< iteamify <<</d' "$CONF_FILE"
sudo tee -a "$CONF_FILE" >/dev/null <<'CONF'
# >>> iteamify >>>
listen_addresses = '127.0.0.1,::1'
password_encryption = scram-sha-256
shared_buffers = 128MB
# <<< iteamify <<<
CONF
sudo cp "$HBA_FILE" "${HBA_FILE}.bak.$(date +%s)"
sudo tee "$HBA_FILE" >/dev/null <<'HBA'
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
HBA
sudo systemctl restart postgresql
for _ in $(seq 1 20); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432
REMOTE
  ok "bootstrap 完成"
}

# ============ Sync the isolated frontend build workspace ============
phase_sync_web() {
  # web-only sync neither uploads nor deletes Go sources in the remote build workspace.
  local -a server_filters=(--filter='hide /server/' --filter='protect /server/')
  log "sync: 增量同步前端源码到 $REMOTE_DIR/build/src（运行中的 release 不受影响）"
  ssh_exec_env REMOTE_DIR <<'REMOTE'
set -Eeuo pipefail
sudo install -d -o ubuntu -g ubuntu "$REMOTE_DIR" "$REMOTE_DIR/build" "$REMOTE_DIR/build/src" "$REMOTE_DIR/releases"
sudo install -d -o ubuntu -g ubuntu /var/log/iteamify
REMOTE

  # 白名单同步：生产构建只需要 Go backend、Next web 和共享 packages。
  # receiver protect 规则保留远端构建缓存；其余未列入白名单的旧文件会删除。
  rsync -az --delete --stats \
    --filter='hide /node_modules/' \
    --filter='protect /node_modules/' \
    --filter='hide /apps/web/.next/' \
    --filter='protect /apps/web/.next/' \
    --filter='hide /.turbo/' \
    --filter='protect /.turbo/' \
    --filter='hide .env' \
    --filter='hide .env.*' \
    --filter='hide .envrc' \
    --filter='hide node_modules/' \
    --filter='hide .next/' \
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
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_DIR/" "$SSH_HOST:$REMOTE_DIR/build/src/"
  ok "sync 完成"
}

# Go components use an isolated source tree so server/daemon deployments cannot
# delete or upload frontend sources, pnpm dependencies, or Next.js caches.
phase_sync_go() {
  log "sync: 增量同步 Go server 源码到 $REMOTE_DIR/build/go-src/server"
  ssh_exec_env REMOTE_DIR <<'REMOTE'
set -Eeuo pipefail
sudo install -d -o ubuntu -g ubuntu \
  "$REMOTE_DIR/build/go-src/server" \
  "$REMOTE_DIR/build/cache/go-build" \
  "$REMOTE_DIR/build/cache/go-mod" \
  "$REMOTE_DIR/server-releases" \
  "$REMOTE_DIR/daemon-releases"
REMOTE

  rsync -az --delete --stats \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='*.log' \
    --exclude='coverage/' \
    --exclude='test-results/' \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
    "$LOCAL_DIR/server/" "$SSH_HOST:$REMOTE_DIR/build/go-src/server/"

  ok "Go 源码 sync 完成"
}

# ============ Install the production config compiler without activating services ============
phase_install_site_config_tool() {
  log "config: 构建并安装 /usr/local/sbin/iteamify-config（不重启服务）"
  ssh_exec_env REMOTE_DIR GO_VERSION DEPLOY_VERSION <<'REMOTE'
set -Eeuo pipefail
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

GO_SOURCE="$REMOTE_DIR/build/go-src/server"
test -f "$GO_SOURCE/cmd/site-config/main.go"
install -d "$REMOTE_DIR/build/cache/go-build" "$REMOTE_DIR/build/cache/go-mod"

if ! command -v go >/dev/null || ! go version 2>/dev/null | grep -q "go$GO_VERSION"; then
  echo "安装 Go $GO_VERSION"
  cd /tmp
  ARCHIVE="go${GO_VERSION}.linux-amd64.tar.gz"
  [ -f "$ARCHIVE" ] || wget -q "https://go.dev/dl/$ARCHIVE"
  sudo rm -rf /usr/local/go
  sudo tar -C /usr/local -xzf "$ARCHIVE"
fi

export GOCACHE="$REMOTE_DIR/build/cache/go-build"
export GOMODCACHE="$REMOTE_DIR/build/cache/go-mod"
TOOL_STAGED="$(mktemp "$REMOTE_DIR/build/iteamify-config.XXXXXX")"
trap 'rm -f -- "$TOOL_STAGED"' EXIT
cd "$GO_SOURCE"
go build -trimpath -ldflags "-X main.version=$DEPLOY_VERSION" \
  -o "$TOOL_STAGED" ./cmd/site-config
sudo install -o root -g root -m 0755 "$TOOL_STAGED" /usr/local/sbin/iteamify-config
/usr/local/sbin/iteamify-config --version
REMOTE
  ok "iteamify-config 已安装；业务服务未重启"
}

# ============ Build, migrate, and activate backend ============
phase_build_server_activate() {
  log "server build: Go backend + migrate（Web、daemon 与 CLI 保持不变）"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE GO_VERSION RELEASE_KEEP <<'REMOTE'
set -Eeuo pipefail
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

GO_SOURCE="$REMOTE_DIR/build/go-src/server"
SERVER_RELEASE_ROOT="$REMOTE_DIR/server-releases"
SERVER_RELEASE_DIR="$SERVER_RELEASE_ROOT/$RELEASE_ID"
SERVER_CURRENT="$REMOTE_DIR/server-current"
DEPLOY_LOG="/var/log/iteamify/server-deploy-$RELEASE_ID.log"
LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
LEGACY_CURRENT_BEFORE="$LEGACY_CURRENT"
PREVIOUS_SERVER=""
if [ -L "$SERVER_CURRENT" ]; then
  PREVIOUS_SERVER="$(readlink -f "$SERVER_CURRENT")"
else
  PREVIOUS_SERVER="$LEGACY_CURRENT"
fi
WEB_PID_BEFORE="$(sudo systemctl show iteamify-web -p MainPID --value)"
DAEMON_PID_BEFORE="$(sudo systemctl show iteamify-daemon -p MainPID --value 2>/dev/null || echo 0)"
CLI_TARGET_BEFORE="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
ACTIVATED=0

server_runtime_complete() {
  local release="$1"
  [ -d "$release" ] &&
    [ -x "$release/bin/iteamify-backend" ] &&
    [ -x "$release/bin/iteamify-migrate" ] &&
    [ -d "$release/server/migrations" ] &&
    [ -f "$release/manifest" ] || return 1
  if grep -Fxq 'site_config_compiler=1' "$release/manifest"; then
    [ -x "$release/bin/iteamify-config" ] || return 1
  fi
}

managed_server_release_complete() {
  local release="$1"
  case "$release" in
    "$SERVER_RELEASE_ROOT"/*) ;;
    *) return 1 ;;
  esac
  server_runtime_complete "$release"
}

run_logged() {
  local label="$1"
  local stage_log="$2"
  shift 2
  echo "--- $label ---"
  if "$@" >"$stage_log" 2>&1; then
    tail -n 20 "$stage_log"
  else
    local rc=$?
    echo "ERROR: $label 失败 (exit=$rc)，最后 200 行：" >&2
    tail -n 200 "$stage_log" >&2 || true
    return "$rc"
  fi
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

env_value_once() {
  local file="$1"
  local key="$2"
  local count
  count="$(sudo awk -F= -v key="$key" '$1 == key { count++ } END { print count + 0 }' "$file")"
  if [ "$count" -ne 1 ]; then
    echo "$file 必须且只能配置一次 $key（当前 $count 次）" >&2
    return 1
  fi
  sudo awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' "$file"
}


rollback_server() {
  local reason="$1"
  local rollback_release=""
  echo "Server 激活失败，开始回滚：$reason" >&2

  if server_runtime_complete "$PREVIOUS_SERVER"; then
    rollback_release="$PREVIOUS_SERVER"
  else
    while IFS= read -r candidate; do
      [ "$candidate" = "$SERVER_RELEASE_DIR" ] && continue
      [ -f "$candidate/.activated" ] || continue
      if managed_server_release_complete "$candidate"; then
        rollback_release="$candidate"
        break
      fi
    done < <(find "$SERVER_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
      -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)
  fi

  if [ -z "$rollback_release" ] && server_runtime_complete "$LEGACY_CURRENT"; then
    rollback_release="$LEGACY_CURRENT"
  fi

  if [ -n "$rollback_release" ]; then
    sudo ln -sfn "$rollback_release" "$SERVER_CURRENT.rollback"
    sudo mv -Tf "$SERVER_CURRENT.rollback" "$SERVER_CURRENT"
    touch "$SERVER_RELEASE_DIR/.failed" 2>/dev/null || true
    sudo systemctl daemon-reload
    sudo systemctl restart iteamify-backend || true
    wait_http http://127.0.0.1:8080/readyz 30 || true
    echo "Server 回滚目标：$rollback_release" >&2
  else
    echo "没有找到完整 Server 回滚版本；保留 server-current" >&2
  fi
  sudo systemctl --no-pager --full status iteamify-backend || true
}

on_server_exit() {
  local rc=$?
  trap - EXIT
  if [ "$rc" -ne 0 ]; then
    if [ "$ACTIVATED" -eq 1 ]; then
      rollback_server "发布脚本退出码 $rc"
    elif [ -d "$SERVER_RELEASE_DIR" ]; then
      touch "$SERVER_RELEASE_DIR/.failed" 2>/dev/null || true
    fi
  fi
  exit "$rc"
}
trap on_server_exit EXIT

sudo touch "$DEPLOY_LOG"
sudo chown ubuntu:ubuntu "$DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

if [ -e "$SERVER_RELEASE_DIR" ]; then
  echo "Server release 已存在，拒绝覆盖：$SERVER_RELEASE_DIR" >&2
  exit 1
fi
if ! server_runtime_complete "$PREVIOUS_SERVER"; then
  echo "当前 Server 运行目录不完整，拒绝发布：$PREVIOUS_SERVER" >&2
  exit 1
fi
sudo systemctl is-active --quiet iteamify-backend
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/readyz >/dev/null
install -d "$SERVER_RELEASE_ROOT" "$SERVER_RELEASE_DIR/bin" "$SERVER_RELEASE_DIR/server"
install -d "$REMOTE_DIR/build/cache/go-build" "$REMOTE_DIR/build/cache/go-mod"

if ! command -v go >/dev/null || ! go version 2>/dev/null | grep -q "go$GO_VERSION"; then
  echo "安装 Go $GO_VERSION"
  cd /tmp
  ARCHIVE="go${GO_VERSION}.linux-amd64.tar.gz"
  [ -f "$ARCHIVE" ] || wget -q "https://go.dev/dl/$ARCHIVE"
  sudo rm -rf /usr/local/go
  sudo tar -C /usr/local -xzf "$ARCHIVE"
fi
go version

export GOCACHE="$REMOTE_DIR/build/cache/go-build"
export GOMODCACHE="$REMOTE_DIR/build/cache/go-mod"
cd "$GO_SOURCE"
LDFLAGS="-X main.version=$DEPLOY_VERSION -X main.commit=$DEPLOY_COMMIT -X main.date=$DEPLOY_DATE"
run_logged "Auro config compiler build" "/tmp/iteamify-go-config-$RELEASE_ID.log" \
  go build -trimpath -ldflags "-X main.version=$DEPLOY_VERSION" \
  -o "$SERVER_RELEASE_DIR/bin/iteamify-config" ./cmd/site-config
sudo install -o root -g root -m 0755 \
  "$SERVER_RELEASE_DIR/bin/iteamify-config" /usr/local/sbin/iteamify-config
if ! sudo test -f /etc/iteamify/config.yaml || ! sudo test -d /etc/iteamify/credentials; then
  echo "缺少 /etc/iteamify/config.yaml 或 /etc/iteamify/credentials" >&2
  echo "配置工具已安装。请先执行：sudo /usr/local/sbin/iteamify-config init" >&2
  exit 1
fi
sudo "$SERVER_RELEASE_DIR/bin/iteamify-config" compile
run_logged "Go backend build" "/tmp/iteamify-go-backend-$RELEASE_ID.log" \
  go build -trimpath -ldflags "$LDFLAGS" -o "$SERVER_RELEASE_DIR/bin/iteamify-backend" ./cmd/server
run_logged "Go migrate build" "/tmp/iteamify-go-migrate-$RELEASE_ID.log" \
  go build -trimpath -o "$SERVER_RELEASE_DIR/bin/iteamify-migrate" ./cmd/migrate
test -d "$GO_SOURCE/migrations"
cp -a "$GO_SOURCE/migrations" "$SERVER_RELEASE_DIR/server/migrations"
printf 'release=%s\nkind=server\ncommit=%s\nversion=%s\nbuilt_at=%s\nsite_config_compiler=1\n' \
  "$RELEASE_ID" "$DEPLOY_COMMIT" "$DEPLOY_VERSION" "$DEPLOY_DATE" \
  >"$SERVER_RELEASE_DIR/manifest"

PW="$(sudo cat /etc/iteamify/.pgpass)"
export DATABASE_URL="postgres://iteamify:${PW}@127.0.0.1:5432/iteamify?sslmode=disable"
cd "$SERVER_RELEASE_DIR"
run_logged "database migrations" "/tmp/iteamify-migrate-$RELEASE_ID.log" \
  ./bin/iteamify-migrate up

# Runtime data must not live inside immutable releases.
sudo install -d -o ubuntu -g ubuntu /app/data/uploads
if [ -d "$PREVIOUS_SERVER/data/uploads" ]; then
  sudo rsync -a --ignore-existing "$PREVIOUS_SERVER/data/uploads/" /app/data/uploads/
  sudo chown -R ubuntu:ubuntu /app/data/uploads
fi
if sudo grep -q '^LOCAL_UPLOAD_DIR=' /etc/iteamify/backend.env; then
  sudo sed -i 's|^LOCAL_UPLOAD_DIR=.*|LOCAL_UPLOAD_DIR=/app/data/uploads|' /etc/iteamify/backend.env
else
  printf '%s\n' 'LOCAL_UPLOAD_DIR=/app/data/uploads' | sudo tee -a /etc/iteamify/backend.env >/dev/null
fi
sudo chmod 600 /etc/iteamify/backend.env

# Any failure after changing the systemd runtime target must trigger a server rollback.
ACTIVATED=1
sudo tee /etc/systemd/system/iteamify-backend.service >/dev/null <<UNIT
[Unit]
Description=Auro Backend
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$SERVER_CURRENT
EnvironmentFile=/etc/iteamify/backend.env
ExecStart=$SERVER_CURRENT/bin/iteamify-backend
Restart=on-failure
RestartSec=5
TimeoutStopSec=45
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

sudo ln -sfn "$SERVER_RELEASE_DIR" "$SERVER_CURRENT.new"
sudo mv -Tf "$SERVER_CURRENT.new" "$SERVER_CURRENT"
sudo systemctl daemon-reload
sudo systemctl enable iteamify-backend >/dev/null
sudo systemctl restart iteamify-backend
if ! wait_http http://127.0.0.1:8080/readyz 60; then
  sudo journalctl -u iteamify-backend -n 120 --no-pager >&2 || true
  exit 1
fi
WEB_PID_AFTER="$(sudo systemctl show iteamify-web -p MainPID --value)"
DAEMON_PID_AFTER="$(sudo systemctl show iteamify-daemon -p MainPID --value 2>/dev/null || echo 0)"
CLI_TARGET_AFTER="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
LEGACY_CURRENT_AFTER="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
test "$WEB_PID_AFTER" = "$WEB_PID_BEFORE"
test "$DAEMON_PID_AFTER" = "$DAEMON_PID_BEFORE"
test "$CLI_TARGET_AFTER" = "$CLI_TARGET_BEFORE"
test "$LEGACY_CURRENT_AFTER" = "$LEGACY_CURRENT_BEFORE"

# Remove legacy duplicate keys only after the generated overlay and backend
# have passed their health gates. A rollback keeps the new systemd
# overlay, so previous compatible binaries continue to receive the compiled
# credentials instead of depending on these obsolete base-env copies.

touch "$SERVER_RELEASE_DIR/.activated"
rm -f -- "$SERVER_RELEASE_DIR/.failed"
ACTIVATED=0
trap - EXIT

CURRENT_SERVER="$(readlink -f "$SERVER_CURRENT")"
mapfile -t SERVER_RELEASES < <(find "$SERVER_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
ROLLBACK_SLOTS=$((RELEASE_KEEP > 0 ? RELEASE_KEEP - 1 : 0))
KEPT_ROLLBACKS=0
for OLD_RELEASE in "${SERVER_RELEASES[@]}"; do
  [ "$OLD_RELEASE" = "$CURRENT_SERVER" ] && continue
  case "$OLD_RELEASE" in
    "$SERVER_RELEASE_ROOT"/*)
      if [ ! -f "$OLD_RELEASE/.failed" ] && managed_server_release_complete "$OLD_RELEASE" && \
         [ "$KEPT_ROLLBACKS" -lt "$ROLLBACK_SLOTS" ]; then
        KEPT_ROLLBACKS=$((KEPT_ROLLBACKS + 1))
      else
        rm -rf -- "$OLD_RELEASE"
      fi
      ;;
  esac
done

echo "server_release=$RELEASE_ID"
echo "web_pid_unchanged=$WEB_PID_AFTER"
echo "daemon_pid_unchanged=$DAEMON_PID_AFTER"
echo "deploy_log=$DEPLOY_LOG"
du -sh "$SERVER_RELEASE_DIR" 2>/dev/null || true
REMOTE
  ok "Server release 已激活: $RELEASE_ID"
}

# ============ Build, smoke-test, and activate only the Next.js frontend ============
phase_build_web_activate() {
  log "web build: pnpm + Next standalone（后端、CLI 与 daemon 保持不变）"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE PNPM_VERSION ITEAMIFY_APP_URL RELEASE_KEEP TURBO_CACHE_KEEP NEXT_CACHE_MAX_MB INSTALL_SCOPE_VERSION <<'REMOTE'
set -Eeuo pipefail
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

BUILD_ROOT="$REMOTE_DIR/build/src"
WEB_RELEASE_ROOT="$REMOTE_DIR/web-releases"
WEB_RELEASE_DIR="$WEB_RELEASE_ROOT/$RELEASE_ID"
WEB_CURRENT="$REMOTE_DIR/web-current"
DEPLOY_LOG="/var/log/iteamify/web-deploy-$RELEASE_ID.log"
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
BACKEND_PID_BEFORE="$(sudo systemctl show iteamify-backend -p MainPID --value)"
DAEMON_PID_BEFORE="$(sudo systemctl show iteamify-daemon -p MainPID --value 2>/dev/null || echo 0)"
CLI_TARGET_BEFORE="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
ACTIVATED=0

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

run_logged() {
  local label="$1"
  local stage_log="$2"
  shift 2
  echo "--- $label ---"
  if "$@" >"$stage_log" 2>&1; then
    tail -n 20 "$stage_log"
  else
    local rc=$?
    echo "ERROR: $label 失败 (exit=$rc)，最后 200 行：" >&2
    tail -n 200 "$stage_log" >&2 || true
    return "$rc"
  fi
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
    sudo systemctl restart iteamify-web || true
    wait_http http://127.0.0.1:3000 30 || true
    echo "前端回滚目标：$rollback_release" >&2
  else
    echo "没有找到完整前端回滚版本；保留 web-current" >&2
  fi
  sudo systemctl --no-pager --full status iteamify-web || true
}

on_web_exit() {
  local rc=$?
  trap - EXIT
  if [ "$rc" -ne 0 ]; then
    if [ "$ACTIVATED" -eq 1 ]; then
      rollback_web "发布脚本退出码 $rc"
    elif [ -d "$WEB_RELEASE_DIR" ]; then
      touch "$WEB_RELEASE_DIR/.failed" 2>/dev/null || true
    fi
  fi
  exit "$rc"
}
trap on_web_exit EXIT

sudo touch "$DEPLOY_LOG"
sudo chown ubuntu:ubuntu "$DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

if [ -e "$WEB_RELEASE_DIR" ]; then
  echo "前端 release 已存在，拒绝覆盖：$WEB_RELEASE_DIR" >&2
  exit 1
fi
if [ -z "$SERVER_RELEASE" ] || [ ! -x "$SERVER_RELEASE/bin/iteamify-backend" ] || \
   [ ! -d "$SERVER_RELEASE/server/migrations" ]; then
  echo "当前 Server release 不可用，拒绝前端独立发布：$SERVER_RELEASE" >&2
  exit 1
fi
if ! web_runtime_complete "$PREVIOUS_WEB"; then
  echo "当前前端运行目录不完整，拒绝发布：$PREVIOUS_WEB" >&2
  exit 1
fi
sudo systemctl is-active --quiet iteamify-backend
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/readyz >/dev/null
install -d "$WEB_RELEASE_ROOT" "$WEB_RELEASE_DIR"

cd "$BUILD_ROOT"
export PNPM_CONFIG_UPDATE_NOTIFIER=false
CURRENT_PNPM="$(pnpm --version 2>/dev/null || true)"
if [ "$CURRENT_PNPM" != "$PNPM_VERSION" ]; then
  sudo npm install -g --force "pnpm@$PNPM_VERSION"
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
  echo "pnpm 安装范围变更为 $INSTALL_SCOPE_VERSION，清理旧全量 workspace 依赖"
  rm -rf -- "$BUILD_ROOT/node_modules"
  find "$BUILD_ROOT/apps" "$BUILD_ROOT/packages" \
    -mindepth 2 -maxdepth 2 -name node_modules -exec rm -rf -- {} + 2>/dev/null || true
fi
run_logged "pnpm install" "/tmp/iteamify-web-pnpm-install-$RELEASE_ID.log" \
  pnpm --filter . --filter '@iteamify/web...' install --frozen-lockfile --prefer-offline
printf '%s\n' "$INSTALL_SCOPE_VERSION" >"$INSTALL_SCOPE_MARKER"

rm -f -- "$BUILD_ROOT/apps/web/.next/lock"
run_logged "Next standalone build" "/tmp/iteamify-web-next-build-$RELEASE_ID.log" \
  env STANDALONE=true REMOTE_API_URL=http://127.0.0.1:8080 NEXT_PUBLIC_APP_VERSION="$DEPLOY_VERSION" \
  pnpm turbo build --filter=@iteamify/web

test -f "$BUILD_ROOT/apps/web/.next/BUILD_ID"
test -f "$BUILD_ROOT/apps/web/.next/prerender-manifest.json"
test -f "$BUILD_ROOT/apps/web/.next/standalone/apps/web/server.js"

cp -a "$BUILD_ROOT/apps/web/.next/standalone/." "$WEB_RELEASE_DIR/"
install -d "$WEB_RELEASE_DIR/apps/web/.next"
cp -a "$BUILD_ROOT/apps/web/.next/static" "$WEB_RELEASE_DIR/apps/web/.next/static"
if [ -d "$BUILD_ROOT/apps/web/public" ]; then
  cp -a "$BUILD_ROOT/apps/web/public" "$WEB_RELEASE_DIR/apps/web/public"
fi
printf 'release=%s\nkind=web\ncommit=%s\nversion=%s\nbuilt_at=%s\nbackend_release=%s\n' \
  "$RELEASE_ID" "$DEPLOY_COMMIT" "$DEPLOY_VERSION" "$DEPLOY_DATE" "$SERVER_RELEASE" \
  >"$WEB_RELEASE_DIR/manifest"

echo "前端 standalone 冒烟测试：127.0.0.1:3100"
(
  cd "$WEB_RELEASE_DIR"
  NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3100 REMOTE_API_URL=http://127.0.0.1:8080 \
    ITEAMIFY_APP_URL="$ITEAMIFY_APP_URL" \
    /usr/bin/node apps/web/server.js >"/tmp/iteamify-web-smoke-$RELEASE_ID.log" 2>&1
) &
SMOKE_PID=$!
if ! wait_http http://127.0.0.1:3100 60; then
  tail -n 100 "/tmp/iteamify-web-smoke-$RELEASE_ID.log" >&2 || true
  kill "$SMOKE_PID" 2>/dev/null || true
  wait "$SMOKE_PID" 2>/dev/null || true
  exit 1
fi
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true

# Any failure after changing the systemd runtime target must trigger a web rollback.
ACTIVATED=1
sudo tee /etc/systemd/system/iteamify-web.service >/dev/null <<UNIT
[Unit]
Description=Auro Web (Next.js standalone)
After=network-online.target iteamify-backend.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$WEB_CURRENT
EnvironmentFile=/etc/iteamify/web.env
Environment=ITEAMIFY_APP_URL=$ITEAMIFY_APP_URL
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
sudo systemctl enable iteamify-web >/dev/null
sudo systemctl restart iteamify-web
if ! wait_http http://127.0.0.1:3000 90; then
  sudo journalctl -u iteamify-web -n 120 --no-pager >&2 || true
  exit 1
fi
if ! wait_http "$ITEAMIFY_APP_URL" 30; then
  echo "正式域名前端健康检查失败：$ITEAMIFY_APP_URL" >&2
  exit 1
fi

curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/readyz >/dev/null
BACKEND_PID_AFTER="$(sudo systemctl show iteamify-backend -p MainPID --value)"
DAEMON_PID_AFTER="$(sudo systemctl show iteamify-daemon -p MainPID --value 2>/dev/null || echo 0)"
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
  echo "Next cache ${NEXT_CACHE_MB}MB 超过 ${NEXT_CACHE_MAX_MB}MB，重置构建缓存"
  rm -rf -- "$NEXT_CACHE_DIR"
fi

echo "web_release=$RELEASE_ID"
echo "backend_pid_unchanged=$BACKEND_PID_AFTER"
echo "daemon_pid_unchanged=$DAEMON_PID_AFTER"
echo "deploy_log=$DEPLOY_LOG"
du -sh "$WEB_RELEASE_DIR" "$NEXT_CACHE_DIR" 2>/dev/null || true
REMOTE
  ok "前端 release 已激活: $RELEASE_ID"
}

# ============ 安全加固（不属于普通发布） ============
phase_harden() {
  log "harden: 关闭公网 5432/8080/8090，仅保留 SSH/80/443"
  ssh_exec_env PORT_BACKEND PORT_DB <<'REMOTE'
set -Eeuo pipefail

test "$(curl --fail --silent http://127.0.0.1:8080/readyz | wc -c)" -gt 0
grep -Fxq 'SERVER_HOST=127.0.0.1' <(sudo cat /etc/iteamify/backend.env)

CONF_FILE="$(sudo -u postgres psql -tAc 'SHOW config_file' | xargs)"
HBA_FILE="$(sudo -u postgres psql -tAc 'SHOW hba_file' | xargs)"
STAMP="$(date +%Y%m%d%H%M%S)"
sudo cp "$CONF_FILE" "${CONF_FILE}.bak.iteamify.$STAMP"
sudo cp "$HBA_FILE" "${HBA_FILE}.bak.iteamify.$STAMP"
sudo sed -i '/# >>> iteamify >>>/,/# <<< iteamify <<</d' "$CONF_FILE"
sudo tee -a "$CONF_FILE" >/dev/null <<'CONF'
# >>> iteamify >>>
listen_addresses = '127.0.0.1,::1'
password_encryption = scram-sha-256
shared_buffers = 128MB
# <<< iteamify <<<
CONF
sudo tee "$HBA_FILE" >/dev/null <<'HBA'
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
HBA
sudo systemctl restart postgresql
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p "$PORT_DB" >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p "$PORT_DB"
curl --fail --silent --show-error http://127.0.0.1:"$PORT_BACKEND"/readyz >/dev/null

# 删除旧的无 TLS :8090 Caddy 入口，保留现有 aurocreator.com/证书配置。
if sudo grep -q '# >>> iteamify self-host >>>' /etc/caddy/Caddyfile; then
  sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.remove-8090.$STAMP"
  TMP_CADDY="$(mktemp)"
  sudo awk '
    /# >>> iteamify self-host >>>/ { skip=1; next }
    /# <<< iteamify self-host <<</ { skip=0; next }
    !skip { print }
  ' /etc/caddy/Caddyfile >"$TMP_CADDY"
  sudo caddy validate --adapter caddyfile --config "$TMP_CADDY"
  sudo install -o root -g root -m 644 "$TMP_CADDY" /etc/caddy/Caddyfile
  rm -f -- "$TMP_CADDY"
  sudo systemctl reload caddy
fi

# 先放行当前 SSH 端口，再启用防火墙，避免锁死远程连接。
SSH_SERVER_PORT="$(awk '{print $4}' <<<"${SSH_CONNECTION:-0 0 0 22}")"
sudo ufw allow "$SSH_SERVER_PORT/tcp" >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw allow 443/udp >/dev/null
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
sudo ufw --force enable >/dev/null

sudo systemctl is-active postgresql iteamify-backend iteamify-web caddy
sudo ss -tlnp | grep -E ':(5432|8080|3000|8090)([[:space:]]|$)' || true
sudo ufw status verbose
REMOTE
  ok "安全加固完成"
}

# ============ Storage cleanup outside active immutable releases ============
phase_prune() {
  log "prune: 清理旧 live 构建、收窄依赖并分别保留各组件最近 $RELEASE_KEEP 个 release"
  acquire_deploy_lock
  ssh_exec_env REMOTE_DIR RELEASE_KEEP PNPM_VERSION TURBO_CACHE_KEEP NEXT_CACHE_MAX_MB INSTALL_SCOPE_VERSION <<'REMOTE'
set -Eeuo pipefail
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

CURRENT_RELEASE="$(readlink -f "$REMOTE_DIR/current")"
case "$CURRENT_RELEASE" in
  "$REMOTE_DIR"/releases/*) ;;
  *) echo "current 不在 releases 内，拒绝清理：$CURRENT_RELEASE" >&2; exit 1 ;;
esac

release_base_complete() {
  local release="$1"
  case "$release" in
    "$REMOTE_DIR"/releases/*) ;;
    *) return 1 ;;
  esac
  [ -d "$release" ] &&
    [ -x "$release/bin/iteamify-backend" ] &&
    [ -f "$release/web/apps/web/server.js" ] &&
    [ -d "$release/server/migrations" ] &&
    [ -f "$release/manifest" ]
}

release_runtime_complete() {
  release_base_complete "$1" && [ -x "$1/bin/iteamify" ]
}

if ! release_runtime_complete "$CURRENT_RELEASE"; then
  echo "current release 不完整，拒绝清理：$CURRENT_RELEASE" >&2
  exit 1
fi
if pgrep -af 'next build|turbo.*build|go build|pnpm.*install' >/tmp/iteamify-prune-processes; then
  echo "检测到构建进程，拒绝清理：" >&2
  cat /tmp/iteamify-prune-processes >&2
  exit 1
fi

BEFORE_KB="$(df -Pk "$REMOTE_DIR" | awk 'NR==2 {print $4}')"

# 旧脚本曾直接在 /opt/iteamify 根目录安装和构建；systemd 已不引用这些产物。
rm -rf -- \
  "$REMOTE_DIR/node_modules" \
  "$REMOTE_DIR/apps/web/.next" \
  "$REMOTE_DIR/.turbo" \

# 根目录 .env 不属于发布源且当前可能由运维人员编辑；保留但收紧权限。
for SECRET_FILE in "$REMOTE_DIR/.env" "$REMOTE_DIR/.env.swp"; do
  [ ! -e "$SECRET_FILE" ] || chmod 600 "$SECRET_FILE"
done

# 若没有进程打开旧源码路径，则移除根目录的过期仓库副本。人工 .env 保留。
OPEN_LEGACY="$({
  sudo lsof -nP 2>/dev/null || true
} | awk -v root="$REMOTE_DIR" '$9 ~ ("^" root "/(apps|packages|server|services|scripts|docs|deploy|docker|tasks|e2e)/") {print $9; exit}')"
if [ -z "$OPEN_LEGACY" ]; then
  rm -rf -- \
    "$REMOTE_DIR/.agents" \
    "$REMOTE_DIR/.github" \
    "$REMOTE_DIR/.serena" \
    "$REMOTE_DIR/.workbuddy" \
    "$REMOTE_DIR/apps" \
    "$REMOTE_DIR/data" \
    "$REMOTE_DIR/deploy" \
    "$REMOTE_DIR/docker" \
    "$REMOTE_DIR/docs" \
    "$REMOTE_DIR/e2e" \
    "$REMOTE_DIR/packages" \
    "$REMOTE_DIR/scripts" \
    "$REMOTE_DIR/server" \
    "$REMOTE_DIR/services" \
    "$REMOTE_DIR/tasks"
  rm -f -- \
    "$REMOTE_DIR/.dockerignore" \
    "$REMOTE_DIR/.env.example" \
    "$REMOTE_DIR/.gitattributes" \
    "$REMOTE_DIR/.gitignore" \
    "$REMOTE_DIR/.goreleaser.yml" \
    "$REMOTE_DIR/.npmrc" \
    "$REMOTE_DIR/.vercelignore" \
    "$REMOTE_DIR/AGENTS.md" \
    "$REMOTE_DIR/CLAUDE.md" \
    "$REMOTE_DIR/CLI_AND_DAEMON.md" \
    "$REMOTE_DIR/CLI_INSTALL.md" \
    "$REMOTE_DIR/Dockerfile" \
    "$REMOTE_DIR/Dockerfile.web" \
    "$REMOTE_DIR/LICENSE" \
    "$REMOTE_DIR/Makefile" \
    "$REMOTE_DIR/README.md" \
    "$REMOTE_DIR/README.zh-CN.md" \
    "$REMOTE_DIR/SDR-TEMPLATE-ANALYSIS.md" \
    "$REMOTE_DIR/SELF_HOSTING.md" \
    "$REMOTE_DIR/SELF_HOSTING_ADVANCED.md" \
    "$REMOTE_DIR/SELF_HOSTING_AI.md" \
    "$REMOTE_DIR/docker-compose.selfhost.build.yml" \
    "$REMOTE_DIR/docker-compose.selfhost.yml" \
    "$REMOTE_DIR/docker-compose.yml" \
    "$REMOTE_DIR/package.json" \
    "$REMOTE_DIR/playwright.config.ts" \
    "$REMOTE_DIR/pnpm-lock.yaml" \
    "$REMOTE_DIR/pnpm-workspace.yaml" \
    "$REMOTE_DIR/skills-lock.json" \
    "$REMOTE_DIR/turbo.json"
else
  echo "检测到进程正在使用旧源码，跳过根仓库清理：$OPEN_LEGACY"
fi

BUILD_ROOT="$REMOTE_DIR/build/src"
# 构建白名单之外的旧源码曾由全仓 rsync 上传；当前 deploy 不构建这些目标。
rm -rf -- \
  "$BUILD_ROOT/.agents" \
  "$BUILD_ROOT/.serena" \
  "$BUILD_ROOT/.workbuddy" \
  "$BUILD_ROOT/apps/desktop" \
  "$BUILD_ROOT/apps/mobile" \
  "$BUILD_ROOT/b2b-sdr-hermes-agent" \
  "$BUILD_ROOT/deploy" \
  "$BUILD_ROOT/docker" \
  "$BUILD_ROOT/docs" \
  "$BUILD_ROOT/e2e" \
  "$BUILD_ROOT/scripts" \
  "$BUILD_ROOT/services" \
  "$BUILD_ROOT/tasks"

INSTALL_SCOPE_MARKER="$BUILD_ROOT/node_modules/.iteamify-install-scope"
if ! grep -Fxq "$INSTALL_SCOPE_VERSION" "$INSTALL_SCOPE_MARKER" 2>/dev/null; then
  echo "重建 web-only pnpm 依赖"
  rm -rf -- "$BUILD_ROOT/node_modules"
  find "$BUILD_ROOT/apps" "$BUILD_ROOT/packages" \
    -mindepth 2 -maxdepth 2 -name node_modules -exec rm -rf -- {} + 2>/dev/null || true
  cd "$BUILD_ROOT"
  export ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  pnpm --filter . --filter '@iteamify/web...' install --frozen-lockfile --prefer-offline
  printf '%s\n' "$INSTALL_SCOPE_VERSION" >"$INSTALL_SCOPE_MARKER"
fi

mapfile -t RELEASES < <(find "$REMOTE_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
ROLLBACK_SLOTS=$((RELEASE_KEEP > 0 ? RELEASE_KEEP - 1 : 0))
KEPT_ROLLBACKS=0
for OLD_RELEASE in "${RELEASES[@]}"; do
  [ "$OLD_RELEASE" = "$CURRENT_RELEASE" ] && continue
  case "$OLD_RELEASE" in
    "$REMOTE_DIR"/releases/*)
      if [ ! -f "$OLD_RELEASE/.failed" ] && release_runtime_complete "$OLD_RELEASE" && \
         [ "$KEPT_ROLLBACKS" -lt "$ROLLBACK_SLOTS" ]; then
        KEPT_ROLLBACKS=$((KEPT_ROLLBACKS + 1))
      else
        rm -rf -- "$OLD_RELEASE"
      fi
      ;;
  esac
done

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
  rm -rf -- "$NEXT_CACHE_DIR"
fi

# Component releases are pruned independently so no active pointer can be
# removed merely because another component was deployed more recently.
component_runtime_complete() {
  local kind="$1"
  local release="$2"
  [ -d "$release" ] && [ -s "$release/manifest" ] && \
    grep -Fxq "kind=$kind" "$release/manifest" || return 1
  case "$kind" in
    server)
      [ -x "$release/bin/iteamify-backend" ] &&
        [ -x "$release/bin/iteamify-migrate" ] &&
        [ -d "$release/server/migrations" ] || return 1
      if grep -Fxq 'site_config_compiler=1' "$release/manifest"; then
        [ -x "$release/bin/iteamify-config" ] || return 1
      fi
      ;;
    web) [ -f "$release/apps/web/server.js" ] ;;
    daemon) [ -x "$release/iteamify" ] ;;
    *) return 1 ;;
  esac
}

prune_component_releases() {
  local kind="$1"
  local release_root="$REMOTE_DIR/${kind}-releases"
  local current_link="$REMOTE_DIR/${kind}-current"
  local current_release=""
  local rollback_slots=$((RELEASE_KEEP > 0 ? RELEASE_KEEP - 1 : 0))
  local kept_rollbacks=0
  local old_release=""
  local -a component_releases=()

  [ -L "$current_link" ] || return 0
  current_release="$(readlink -f "$current_link")"
  case "$current_release" in
    "$release_root"/*) ;;
    *) echo "$current_link 不在 $release_root 内，拒绝清理：$current_release" >&2; return 1 ;;
  esac
  component_runtime_complete "$kind" "$current_release" || {
    echo "$kind current release 不完整，拒绝清理：$current_release" >&2
    return 1
  }

  mapfile -t component_releases < <(find "$release_root" -mindepth 1 -maxdepth 1 -type d \
    -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
  for old_release in "${component_releases[@]}"; do
    [ "$old_release" = "$current_release" ] && continue
    case "$old_release" in
      "$release_root"/*)
        if [ ! -f "$old_release/.failed" ] && \
           component_runtime_complete "$kind" "$old_release" && \
           [ "$kept_rollbacks" -lt "$rollback_slots" ]; then
          kept_rollbacks=$((kept_rollbacks + 1))
        else
          rm -rf -- "$old_release"
        fi
        ;;
    esac
  done
}

prune_component_releases server
prune_component_releases web
prune_component_releases daemon

AFTER_KB="$(df -Pk "$REMOTE_DIR" | awk 'NR==2 {print $4}')"
echo "reclaimed_mb=$(((AFTER_KB - BEFORE_KB) / 1024))"
du -xhd1 "$REMOTE_DIR" 2>/dev/null | sort -h
REMOTE
  release_deploy_lock
  ok "prune 完成"
}

# ============ Build and activate only the daemon/CLI/MCP runtime ============
phase_build_daemon_activate() {
  log "daemon build: Auro CLI + daemon + MCP（backend 与 Web 保持不变）"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE GO_VERSION RELEASE_KEEP <<'REMOTE'
set -Eeuo pipefail
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

GO_SOURCE="$REMOTE_DIR/build/go-src/server"
DAEMON_RELEASE_ROOT="$REMOTE_DIR/daemon-releases"
DAEMON_RELEASE_DIR="$DAEMON_RELEASE_ROOT/$RELEASE_ID"
DAEMON_CURRENT="$REMOTE_DIR/daemon-current"
DEPLOY_LOG="/var/log/iteamify/daemon-deploy-$RELEASE_ID.log"
LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
LEGACY_CURRENT_BEFORE="$LEGACY_CURRENT"
PREVIOUS_DAEMON=""
if [ -L "$DAEMON_CURRENT" ]; then
  PREVIOUS_DAEMON="$(readlink -f "$DAEMON_CURRENT")"
else
  INSTALLED_CLI="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
  if [ -n "$INSTALLED_CLI" ]; then
    PREVIOUS_DAEMON="$(dirname "$INSTALLED_CLI")"
  fi
fi
BACKEND_PID_BEFORE="$(sudo systemctl show iteamify-backend -p MainPID --value)"
WEB_PID_BEFORE="$(sudo systemctl show iteamify-web -p MainPID --value)"
SERVER_TARGET_BEFORE=""
WEB_TARGET_BEFORE=""
[ ! -L "$REMOTE_DIR/server-current" ] || SERVER_TARGET_BEFORE="$(readlink -f "$REMOTE_DIR/server-current")"
[ ! -L "$REMOTE_DIR/web-current" ] || WEB_TARGET_BEFORE="$(readlink -f "$REMOTE_DIR/web-current")"
ACTIVATED=0

daemon_runtime_complete() {
  local release="$1"
  [ -d "$release" ] && [ -x "$release/iteamify" ]
}

managed_daemon_release_complete() {
  local release="$1"
  case "$release" in
    "$DAEMON_RELEASE_ROOT"/*) ;;
    *) return 1 ;;
  esac
  daemon_runtime_complete "$release" && [ -f "$release/manifest" ]
}

run_logged() {
  local label="$1"
  local stage_log="$2"
  shift 2
  echo "--- $label ---"
  if "$@" >"$stage_log" 2>&1; then
    tail -n 20 "$stage_log"
  else
    local rc=$?
    echo "ERROR: $label 失败 (exit=$rc)，最后 200 行：" >&2
    tail -n 200 "$stage_log" >&2 || true
    return "$rc"
  fi
}

daemon_health_ready() {
  python3 -c '
import json, sys
health = json.load(sys.stdin)
if health.get("status") != "running":
    print("daemon status is {!r}, want running".format(health.get("status")), file=sys.stderr)
    raise SystemExit(1)
if health.get("supervisor") != "systemd":
    print("daemon supervisor is {!r}, want systemd".format(health.get("supervisor")), file=sys.stderr)
    raise SystemExit(1)
expected = {item for item in health.get("agents", []) if isinstance(item, str) and item}
for workspace in health.get("workspaces", []):
    registered = {item for item in workspace.get("registered_agents", []) if isinstance(item, str) and item}
    missing = sorted(expected - registered)
    if missing:
        print("workspace {} missing registered agents: {}".format(workspace.get("id", "unknown"), ", ".join(missing)), file=sys.stderr)
        raise SystemExit(1)
'
}

wait_daemon_ready() {
  local attempts="${1:-45}"
  local health=""
  for _ in $(seq 1 "$attempts"); do
    health="$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:19514/health 2>/dev/null || true)"
    if [ -n "$health" ] && printf '%s' "$health" | daemon_health_ready >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  if [ -n "$health" ]; then
    printf '%s' "$health" | daemon_health_ready || true
  fi
  echo "daemon 未在 ${attempts} 秒内完成 runtime 注册；最后健康状态：${health:-unavailable}" >&2
  return 1
}

activate_daemon_links() {
  local release="$1"
  daemon_runtime_complete "$release"
  sudo ln -sfn "$release" "$DAEMON_CURRENT.new"
  sudo mv -Tf "$DAEMON_CURRENT.new" "$DAEMON_CURRENT"
  sudo ln -sfn "$DAEMON_CURRENT/iteamify" "$REMOTE_DIR/iteamify-cli.new"
  sudo mv -Tf "$REMOTE_DIR/iteamify-cli.new" "$REMOTE_DIR/iteamify-cli"
  sudo ln -sfn "$REMOTE_DIR/iteamify-cli" /usr/local/bin/iteamify.new
  sudo mv -Tf /usr/local/bin/iteamify.new /usr/local/bin/iteamify
}

rollback_daemon() {
  local reason="$1"
  local rollback_release=""
  echo "Daemon 激活失败，开始回滚：$reason" >&2

  if daemon_runtime_complete "$PREVIOUS_DAEMON"; then
    rollback_release="$PREVIOUS_DAEMON"
  else
    while IFS= read -r candidate; do
      [ "$candidate" = "$DAEMON_RELEASE_DIR" ] && continue
      [ -f "$candidate/.activated" ] || continue
      if managed_daemon_release_complete "$candidate"; then
        rollback_release="$candidate"
        break
      fi
    done < <(find "$DAEMON_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
      -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)
  fi

  if [ -z "$rollback_release" ] && [ -x "$LEGACY_CURRENT/bin/iteamify" ]; then
    rollback_release="$LEGACY_CURRENT/bin"
  fi

  if [ -n "$rollback_release" ]; then
    activate_daemon_links "$rollback_release"
    touch "$DAEMON_RELEASE_DIR/.failed" 2>/dev/null || true
    sudo systemctl daemon-reload
    sudo systemctl restart iteamify-daemon || true
    wait_daemon_ready 45 || true
    echo "Daemon 回滚目标：$rollback_release" >&2
  else
    echo "没有找到完整 Daemon 回滚版本；保留 daemon-current" >&2
  fi
  sudo systemctl --no-pager --full status iteamify-daemon || true
}

on_daemon_exit() {
  local rc=$?
  trap - EXIT
  if [ "$rc" -ne 0 ]; then
    if [ "$ACTIVATED" -eq 1 ]; then
      rollback_daemon "发布脚本退出码 $rc"
    elif [ -d "$DAEMON_RELEASE_DIR" ]; then
      touch "$DAEMON_RELEASE_DIR/.failed" 2>/dev/null || true
    fi
  fi
  exit "$rc"
}
trap on_daemon_exit EXIT

sudo touch "$DEPLOY_LOG"
sudo chown ubuntu:ubuntu "$DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

if [ -e "$DAEMON_RELEASE_DIR" ]; then
  echo "Daemon release 已存在，拒绝覆盖：$DAEMON_RELEASE_DIR" >&2
  exit 1
fi
if ! daemon_runtime_complete "$PREVIOUS_DAEMON"; then
  echo "当前 Daemon/CLI 运行目录不完整，拒绝发布：$PREVIOUS_DAEMON" >&2
  exit 1
fi
install -d "$DAEMON_RELEASE_ROOT" "$DAEMON_RELEASE_DIR"
install -d "$REMOTE_DIR/build/cache/go-build" "$REMOTE_DIR/build/cache/go-mod"

if ! command -v go >/dev/null || ! go version 2>/dev/null | grep -q "go$GO_VERSION"; then
  echo "安装 Go $GO_VERSION"
  cd /tmp
  ARCHIVE="go${GO_VERSION}.linux-amd64.tar.gz"
  [ -f "$ARCHIVE" ] || wget -q "https://go.dev/dl/$ARCHIVE"
  sudo rm -rf /usr/local/go
  sudo tar -C /usr/local -xzf "$ARCHIVE"
fi
go version

export GOCACHE="$REMOTE_DIR/build/cache/go-build"
export GOMODCACHE="$REMOTE_DIR/build/cache/go-mod"
cd "$GO_SOURCE"
LDFLAGS="-X main.version=$DEPLOY_VERSION -X main.commit=$DEPLOY_COMMIT -X main.date=$DEPLOY_DATE"
run_logged "Auro CLI build" "/tmp/iteamify-go-cli-$RELEASE_ID.log" \
  go build -trimpath -ldflags "$LDFLAGS" -o "$DAEMON_RELEASE_DIR/iteamify" ./cmd/iteamify
run_logged "Auro CLI MCP smoke test" "/tmp/iteamify-cli-mcp-$RELEASE_ID.log" \
  "$DAEMON_RELEASE_DIR/iteamify" mcp serve --help
CLI_SHA256="$(sha256sum "$DAEMON_RELEASE_DIR/iteamify" | awk '{print $1}')"
printf 'release=%s\nkind=daemon\ncommit=%s\nversion=%s\nbuilt_at=%s\nsha256=%s\n' \
  "$RELEASE_ID" "$DEPLOY_COMMIT" "$DEPLOY_VERSION" "$DEPLOY_DATE" "$CLI_SHA256" \
  >"$DAEMON_RELEASE_DIR/manifest"

# Never interrupt an active agent task during a daemon-only deployment. A
# missing or malformed health response is unsafe, so activation stops as well.
sudo systemctl is-active --quiet iteamify-daemon
DAEMON_HEALTH="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:19514/health)"
printf '%s' "$DAEMON_HEALTH" | python3 -c '
import json, sys
health = json.load(sys.stdin)
active = health.get("active_task_count")
if active != 0:
    raise SystemExit("daemon has active tasks: {}".format(active))
'

# Any failure after changing the systemd runtime target must trigger a daemon rollback.
ACTIVATED=1
sudo tee /etc/systemd/system/iteamify-daemon.service >/dev/null <<UNIT
[Unit]
Description=Auro Agent Daemon
After=network-online.target iteamify-backend.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu
Environment=HOME=/home/ubuntu
Environment=PATH=/home/ubuntu/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=ITEAMIFY_DAEMON_AUTO_UPDATE=false
Environment=ITEAMIFY_DAEMON_SUPERVISOR=systemd
ExecStart=$DAEMON_CURRENT/iteamify daemon start --foreground
Restart=always
RestartSec=5
TimeoutStopSec=45
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

activate_daemon_links "$DAEMON_RELEASE_DIR"
sudo systemctl daemon-reload
sudo systemctl enable iteamify-daemon >/dev/null
sudo systemctl reset-failed iteamify-daemon
sudo systemctl restart iteamify-daemon
if ! wait_daemon_ready 45; then
  sudo journalctl -u iteamify-daemon -n 120 --no-pager >&2 || true
  exit 1
fi

BACKEND_PID_AFTER="$(sudo systemctl show iteamify-backend -p MainPID --value)"
WEB_PID_AFTER="$(sudo systemctl show iteamify-web -p MainPID --value)"
SERVER_TARGET_AFTER=""
WEB_TARGET_AFTER=""
[ ! -L "$REMOTE_DIR/server-current" ] || SERVER_TARGET_AFTER="$(readlink -f "$REMOTE_DIR/server-current")"
[ ! -L "$REMOTE_DIR/web-current" ] || WEB_TARGET_AFTER="$(readlink -f "$REMOTE_DIR/web-current")"
LEGACY_CURRENT_AFTER="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
test "$BACKEND_PID_AFTER" = "$BACKEND_PID_BEFORE"
test "$WEB_PID_AFTER" = "$WEB_PID_BEFORE"
test "$SERVER_TARGET_AFTER" = "$SERVER_TARGET_BEFORE"
test "$WEB_TARGET_AFTER" = "$WEB_TARGET_BEFORE"
test "$LEGACY_CURRENT_AFTER" = "$LEGACY_CURRENT_BEFORE"

touch "$DAEMON_RELEASE_DIR/.activated"
rm -f -- "$DAEMON_RELEASE_DIR/.failed"
ACTIVATED=0
trap - EXIT

CURRENT_DAEMON="$(readlink -f "$DAEMON_CURRENT")"
mapfile -t DAEMON_RELEASES < <(find "$DAEMON_RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
ROLLBACK_SLOTS=$((RELEASE_KEEP > 0 ? RELEASE_KEEP - 1 : 0))
KEPT_ROLLBACKS=0
for OLD_RELEASE in "${DAEMON_RELEASES[@]}"; do
  [ "$OLD_RELEASE" = "$CURRENT_DAEMON" ] && continue
  case "$OLD_RELEASE" in
    "$DAEMON_RELEASE_ROOT"/*)
      if [ ! -f "$OLD_RELEASE/.failed" ] && managed_daemon_release_complete "$OLD_RELEASE" && \
         [ "$KEPT_ROLLBACKS" -lt "$ROLLBACK_SLOTS" ]; then
        KEPT_ROLLBACKS=$((KEPT_ROLLBACKS + 1))
      else
        rm -rf -- "$OLD_RELEASE"
      fi
      ;;
  esac
done

echo "daemon_release=$RELEASE_ID"
echo "backend_pid_unchanged=$BACKEND_PID_AFTER"
echo "web_pid_unchanged=$WEB_PID_AFTER"
echo "deploy_log=$DEPLOY_LOG"
du -sh "$DAEMON_RELEASE_DIR" 2>/dev/null || true
REMOTE
  ok "Daemon release 已激活: $RELEASE_ID"
}

# ============ Component-aware verification ============
phase_verify() {
  log "verify: systemd、组件 release、数据库与本机监听"
  ssh_exec_env REMOTE_DIR <<'REMOTE'
set -Eeuo pipefail
sudo systemctl is-active postgresql iteamify-backend iteamify-web iteamify-daemon caddy

LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
INSTALLED_CLI="$(readlink -f /usr/local/bin/iteamify)"
test -n "$LEGACY_CURRENT"

if [ -L "$REMOTE_DIR/server-current" ]; then
  SERVER_TARGET="$(readlink -f "$REMOTE_DIR/server-current")"
  case "$SERVER_TARGET" in "$REMOTE_DIR"/server-releases/*) ;; *) exit 1 ;; esac
  SERVER_MANIFEST="$SERVER_TARGET/manifest"
  grep -Fxq 'kind=server' "$SERVER_MANIFEST"
  test "$(sudo systemctl show iteamify-backend -p WorkingDirectory --value)" = "$REMOTE_DIR/server-current"
else
  SERVER_TARGET="$LEGACY_CURRENT"
  SERVER_MANIFEST="$LEGACY_CURRENT/manifest"
fi
test -x "$SERVER_TARGET/bin/iteamify-backend"
test -x "$SERVER_TARGET/bin/iteamify-migrate"
test -x "$SERVER_TARGET/bin/iteamify-config"
test -d "$SERVER_TARGET/server/migrations"
test -s "$SERVER_MANIFEST"
grep -Fxq 'site_config_compiler=1' "$SERVER_MANIFEST"

if [ -L "$REMOTE_DIR/web-current" ]; then
  WEB_TARGET="$(readlink -f "$REMOTE_DIR/web-current")"
  case "$WEB_TARGET" in "$REMOTE_DIR"/web-releases/*) ;; *) exit 1 ;; esac
  WEB_MANIFEST="$WEB_TARGET/manifest"
  grep -Fxq 'kind=web' "$WEB_MANIFEST"
  test "$(sudo systemctl show iteamify-web -p WorkingDirectory --value)" = "$REMOTE_DIR/web-current"
else
  WEB_TARGET="$LEGACY_CURRENT/web"
  WEB_MANIFEST="$LEGACY_CURRENT/manifest"
fi
test -f "$WEB_TARGET/apps/web/server.js"
test -s "$WEB_MANIFEST"

if [ -L "$REMOTE_DIR/daemon-current" ]; then
  DAEMON_TARGET="$(readlink -f "$REMOTE_DIR/daemon-current")"
  case "$DAEMON_TARGET" in "$REMOTE_DIR"/daemon-releases/*) ;; *) exit 1 ;; esac
  DAEMON_MANIFEST="$DAEMON_TARGET/manifest"
  grep -Fxq 'kind=daemon' "$DAEMON_MANIFEST"
  sudo systemctl cat iteamify-daemon | \
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
curl --fail --silent --show-error http://127.0.0.1:8080/readyz
echo
curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3000
PW="$(sudo cat /etc/iteamify/.pgpass)"
PGPASSWORD="$PW" psql "postgres://iteamify@127.0.0.1:5432/iteamify?sslmode=disable" \
  -X -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM schema_migrations;'
echo "listeners:"
sudo ss -tlnp | grep -E ':(5432|8080|3000|8090|9443)([[:space:]]|$)' || true
echo "daemon:"
sudo systemctl is-enabled iteamify-daemon
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
expected = {item for item in health.get("agents", []) if isinstance(item, str) and item}
for workspace in health.get("workspaces", []):
    registered = {item for item in workspace.get("registered_agents", []) if isinstance(item, str) and item}
    missing = sorted(expected - registered)
    if missing:
        raise SystemExit("workspace {} missing registered agents: {}".format(workspace.get("id", "unknown"), ", ".join(missing)))
'
printf '%s\n' "$DAEMON_HEALTH"
REMOTE

  log "verify: 正式域名 HTTPS"
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL/healthz" >/dev/null
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL" >/dev/null
  ok "$ITEAMIFY_APP_URL 前后端均可访问"
}

phase_verify_web() {
  log "web verify: 前端 release、服务和后端隔离状态"
  ssh_exec_env REMOTE_DIR <<'REMOTE'
set -Eeuo pipefail
sudo systemctl is-active iteamify-backend iteamify-web
WEB_TARGET="$(readlink -f "$REMOTE_DIR/web-current")"
case "$WEB_TARGET" in
  "$REMOTE_DIR"/web-releases/*) ;;
  *) echo "web-current 不在 web-releases 内：$WEB_TARGET" >&2; exit 1 ;;
esac
test -f "$WEB_TARGET/apps/web/server.js"
test -s "$WEB_TARGET/manifest"
grep -Fxq 'kind=web' "$WEB_TARGET/manifest"
test "$(sudo systemctl show iteamify-web -p WorkingDirectory --value)" = "$REMOTE_DIR/web-current"
if [ -L "$REMOTE_DIR/server-current" ]; then
  SERVER_TARGET="$(readlink -f "$REMOTE_DIR/server-current")"
else
  SERVER_TARGET="$(readlink -f "$REMOTE_DIR/current")"
fi
echo "web_current=$WEB_TARGET"
cat "$WEB_TARGET/manifest"
echo "server_current=$SERVER_TARGET"
echo "backend_pid=$(sudo systemctl show iteamify-backend -p MainPID --value)"
echo "daemon_pid=$(sudo systemctl show iteamify-daemon -p MainPID --value 2>/dev/null || echo 0)"
curl --fail --silent --show-error http://127.0.0.1:8080/readyz
echo
curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3000
REMOTE

  log "web verify: 正式域名 HTTPS"
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL/healthz" >/dev/null
  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL" >/dev/null
  ok "$ITEAMIFY_APP_URL 前端发布验证通过"
}

phase_verify_server() {
  log "server verify: 后端 release、迁移和其他组件隔离状态"
  ssh_exec_env REMOTE_DIR <<'REMOTE'
set -Eeuo pipefail
sudo systemctl is-active postgresql iteamify-backend iteamify-web iteamify-daemon
SERVER_TARGET="$(readlink -f "$REMOTE_DIR/server-current")"
case "$SERVER_TARGET" in
  "$REMOTE_DIR"/server-releases/*) ;;
  *) echo "server-current 不在 server-releases 内：$SERVER_TARGET" >&2; exit 1 ;;
esac
test -x "$SERVER_TARGET/bin/iteamify-backend"
test -x "$SERVER_TARGET/bin/iteamify-migrate"
test -x "$SERVER_TARGET/bin/iteamify-config"
test -d "$SERVER_TARGET/server/migrations"
test -s "$SERVER_TARGET/manifest"
grep -Fxq 'kind=server' "$SERVER_TARGET/manifest"
grep -Fxq 'site_config_compiler=1' "$SERVER_TARGET/manifest"
test "$(sudo systemctl show iteamify-backend -p WorkingDirectory --value)" = "$REMOTE_DIR/server-current"
sudo systemctl cat iteamify-backend.service | \
  grep -Fq 'EnvironmentFile=/etc/iteamify/backend.env'
sudo "$SERVER_TARGET/bin/iteamify-config" validate
grep -Fxq 'LOCAL_UPLOAD_DIR=/app/data/uploads' <(sudo cat /etc/iteamify/backend.env)
test -d /app/data/uploads
echo "server_current=$SERVER_TARGET"
cat "$SERVER_TARGET/manifest"
echo "backend_pid=$(sudo systemctl show iteamify-backend -p MainPID --value)"
echo "web_pid=$(sudo systemctl show iteamify-web -p MainPID --value)"
echo "daemon_pid=$(sudo systemctl show iteamify-daemon -p MainPID --value)"
curl --fail --silent --show-error http://127.0.0.1:8080/readyz
echo
PW="$(sudo cat /etc/iteamify/.pgpass)"
PGPASSWORD="$PW" psql "postgres://iteamify@127.0.0.1:5432/iteamify?sslmode=disable" \
  -X -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM schema_migrations;'
REMOTE

  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL/healthz" >/dev/null
  ok "$ITEAMIFY_APP_URL Server 发布验证通过"
}

phase_verify_daemon() {
  log "daemon verify: CLI release、systemd 托管和 provider 注册"
  ssh_exec_env REMOTE_DIR <<'REMOTE'
set -Eeuo pipefail
sudo systemctl is-active iteamify-backend iteamify-web iteamify-daemon
DAEMON_TARGET="$(readlink -f "$REMOTE_DIR/daemon-current")"
case "$DAEMON_TARGET" in
  "$REMOTE_DIR"/daemon-releases/*) ;;
  *) echo "daemon-current 不在 daemon-releases 内：$DAEMON_TARGET" >&2; exit 1 ;;
esac
test -x "$DAEMON_TARGET/iteamify"
test -s "$DAEMON_TARGET/manifest"
grep -Fxq 'kind=daemon' "$DAEMON_TARGET/manifest"
INSTALLED_CLI="$(readlink -f /usr/local/bin/iteamify)"
test "$INSTALLED_CLI" = "$(readlink -f "$DAEMON_TARGET/iteamify")"
sudo systemctl cat iteamify-daemon | \
  grep -Fq "ExecStart=$REMOTE_DIR/daemon-current/iteamify daemon start --foreground"
"$INSTALLED_CLI" version
"$INSTALLED_CLI" mcp serve --help >/dev/null
DAEMON_HEALTH="$(curl --fail --silent --show-error http://127.0.0.1:19514/health)"
printf '%s' "$DAEMON_HEALTH" | python3 -c '
import json, sys
health = json.load(sys.stdin)
if health.get("status") != "running" or health.get("supervisor") != "systemd":
    raise SystemExit("daemon is not ready under systemd")
if health.get("active_task_count") is None:
    raise SystemExit("daemon health omits active_task_count")
expected = {item for item in health.get("agents", []) if isinstance(item, str) and item}
for workspace in health.get("workspaces", []):
    registered = {item for item in workspace.get("registered_agents", []) if isinstance(item, str) and item}
    missing = sorted(expected - registered)
    if missing:
        raise SystemExit("workspace {} missing registered agents: {}".format(workspace.get("id", "unknown"), ", ".join(missing)))
'
echo "daemon_current=$DAEMON_TARGET"
cat "$DAEMON_TARGET/manifest"
echo "backend_pid=$(sudo systemctl show iteamify-backend -p MainPID --value)"
echo "web_pid=$(sudo systemctl show iteamify-web -p MainPID --value)"
printf '%s\n' "$DAEMON_HEALTH"
REMOTE
  ok "daemon 发布验证通过"
}

phase_unlock() {
  log "unlock: 检查服务器是否存在部署/构建进程"
  ssh_exec_env DEPLOY_LOCK_DIR <<'REMOTE'
set -Eeuo pipefail
if ! sudo test -d "$DEPLOY_LOCK_DIR"; then
  echo "没有部署锁"
  exit 0
fi
if pgrep -af 'next build|turbo.*build|go build|pnpm.*install' >/tmp/iteamify-deploy-processes; then
  echo "仍存在构建进程，拒绝解锁：" >&2
  cat /tmp/iteamify-deploy-processes >&2
  exit 1
fi
echo "清理陈旧锁，原 owner：$(sudo cat "$DEPLOY_LOCK_DIR/owner" 2>/dev/null || echo unknown)"
sudo rm -f -- "$DEPLOY_LOCK_DIR/owner"
sudo rmdir -- "$DEPLOY_LOCK_DIR"
REMOTE
  ok "unlock 完成"
}

phase_deploy() {
  phase_preflight
  acquire_deploy_lock
  phase_sync_go
  phase_sync_web
  # Sequential builds avoid memory pressure on the current 4 GB host. Each
  # activation has its own rollback boundary while the outer lock prevents a
  # concurrent component deployment from invalidating PID/pointer assertions.
  phase_build_server_activate
  phase_build_web_activate
  phase_build_daemon_activate
  release_deploy_lock
  phase_verify
}

phase_server() {
  phase_preflight
  acquire_deploy_lock
  phase_sync_go
  phase_build_server_activate
  release_deploy_lock
  phase_verify_server
}

phase_web() {
  phase_preflight
  acquire_deploy_lock
  phase_sync_web
  phase_build_web_activate
  release_deploy_lock
  phase_verify_web
}

phase_daemon() {
  phase_preflight
  acquire_deploy_lock
  phase_sync_go
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
  server)      phase_server ;;
  daemon)      phase_daemon ;;
  config)      phase_config ;;
  preflight)  phase_preflight ;;
  bootstrap)  phase_bootstrap ;;
  harden)     phase_harden ;;
  prune)      phase_prune ;;
  verify)     phase_verify ;;
  unlock)     phase_unlock ;;
  *)
    err "未知阶段: $PHASE"
    echo "用法: $0 [deploy|server|web|daemon|config|preflight|bootstrap|harden|prune|verify|unlock]"
    exit 1
    ;;
esac

ok "完成: $PHASE"
