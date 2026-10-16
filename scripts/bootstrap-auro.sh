#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu/Debian host for AuroCreator deployment.
#
# 设计原则（与 deploy-aurocreator.sh 对齐）:
# - 与发布逻辑解耦：先把基础依赖、目录、系统用户、数据库/反代环境齐备；
# - 幂等：重复执行安全；
# - 可预演：支持 --dry-run；
# - 安全默认：仅安装服务器部署必要能力，密钥类文件只放在 root-only 路径；
# - 可分步关闭：支持 --skip-* 进行定制。
#
# 用法:
#   ./scripts/bootstrap-auro.sh \
#     --host auro \
#     --app-url https://aurocreator.com \
#     --deploy-user aurocreator --deploy-home /var/lib/aurocreator \
#     --force

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_HOST="${SSH_HOST:-auro}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/aurocreator}"
APP_URL="${ITEAMIFY_APP_URL:-https://aurocreator.com}"
PUBLIC_IP="${PUBLIC_IP:-}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-20}"
SSH_RETRY_COUNT="${SSH_RETRY_COUNT:-4}"
SSH_RETRY_DELAY="${SSH_RETRY_DELAY:-4}"
SSH_IP_FAMILY="${SSH_IP_FAMILY:-4}"

DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_HOME="${DEPLOY_HOME:-/home/ubuntu}"

POSTGRES_VERSION="${POSTGRES_VERSION:-17}"
NODE_VERSION="${NODE_VERSION:-22.23.2}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PNPM_VERSION="${PNPM_VERSION:-$(sed -nE 's/^[[:space:]]*"packageManager":[[:space:]]*"pnpm@([^"]+)".*/\1/p' "$PROJECT_ROOT/package.json")}"
GO_VERSION="${GO_VERSION:-1.26.1}"

INSTALL_NODE=true
INSTALL_GO=false
INSTALL_POSTGRES=true
INSTALL_NGINX=true
SETUP_FIREWALL=true
INSTALL_REDIS=true
VERIFY_ONLY=false

FORCE=false
DRY_RUN=false

log() { printf '\033[36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok() { printf '\033[32m[%s] ✓ %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[33m[%s] ! %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
err() { printf '\033[31m[%s] ✗ %s\033[0m\n' "$(date +%H:%M:%S)" "$*" >&2; }

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/bootstrap-auro.sh [options]

Core options:
  --host <ssh-host>             SSH host, default: auro
  --ssh-key <path>              SSH private key
  --remote-dir <path>           Remote working root, default: /opt/aurocreator
  --app-url <url>               Used by hardening check, default: https://aurocreator.com
  --deploy-user <user>          Service user, default: ubuntu
  --deploy-home <path>          Service home, default: /home/ubuntu

Dependency options:
  --postgres-version <17>       PostgreSQL major version
  --node-version <22.23.2>      Node.js version
  --node-major <22>             Node.js minimum major version
  --pnpm-version <version>      Defaults to package.json packageManager
  --go-version <1.26.1>         Go version for optional build fallback

Execution flags:
  --skip-node                   Skip Node.js installation
  --skip-go                     Skip Go installation
  --skip-postgres               Skip PostgreSQL installation
  --skip-nginx                  Skip nginx/certbot installation
  --skip-firewall               Skip ufw install/config
  --ssh-connect-timeout <20>    SSH连接超时(秒), 默认20
  --ssh-retry-count <4>         SSH重试次数, 默认4
  --ssh-retry-delay <4>         SSH重试间隔(秒), 默认4
  --ssh-ip-family <4|6|auto>    强制SSH地址族(默认4), 默认4
  --verify-only                 Only verify environment and exit
  --dry-run                     Only print planned commands
  --force/-y                    Skip interactive confirm
  -h/--help                     Show this help

Examples:
  ./scripts/bootstrap-auro.sh --force --skip-go
  ./scripts/bootstrap-auro.sh --host auro --skip-firewall --dry-run
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) SSH_HOST="${2:-}"; shift 2 ;;
    --ssh-key) SSH_KEY="${2:-}"; shift 2 ;;
    --remote-dir) REMOTE_DIR="${2:-}"; shift 2 ;;
    --app-url) APP_URL="${2:-}"; shift 2 ;;
    --deploy-user) DEPLOY_USER="${2:-}"; shift 2 ;;
    --deploy-home) DEPLOY_HOME="${2:-}"; shift 2 ;;
    --postgres-version) POSTGRES_VERSION="${2:-}"; shift 2 ;;
    --node-version) NODE_VERSION="${2:-}"; shift 2 ;;
    --node-major) NODE_MAJOR="${2:-}"; shift 2 ;;
    --pnpm-version) PNPM_VERSION="${2:-}"; shift 2 ;;
    --go-version) GO_VERSION="${2:-}"; shift 2 ;;
    --skip-node) INSTALL_NODE=false; shift ;;
    --skip-go) INSTALL_GO=false; shift ;;
    --skip-postgres) INSTALL_POSTGRES=false; shift ;;
    --skip-nginx) INSTALL_NGINX=false; shift ;;
    --skip-firewall) SETUP_FIREWALL=false; shift ;;
    --skip-redis) INSTALL_REDIS=false; shift ;;
    --ssh-connect-timeout) SSH_CONNECT_TIMEOUT="${2:-20}"; shift 2 ;;
    --ssh-retry-count) SSH_RETRY_COUNT="${2:-4}"; shift 2 ;;
    --ssh-retry-delay) SSH_RETRY_DELAY="${2:-4}"; shift 2 ;;
    --ssh-ip-family) SSH_IP_FAMILY="${2:-4}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force|-y) FORCE=true; shift ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -z "$SSH_HOST" ]; then
  err "SSH_HOST 不能为空"
  exit 1
fi
case "$SSH_IP_FAMILY" in
  4|6|auto) ;;
  *) err "--ssh-ip-family 仅支持 4, 6, auto"; exit 1 ;;
esac

run_remote() {
  local stage="$1"
  shift
  local attempt=1
  local output
  local rc=0
  local -a base_ssh_opts=(
    -o StrictHostKeyChecking=accept-new
    -o ConnectTimeout="${SSH_CONNECT_TIMEOUT}"
    -o ServerAliveInterval=10
    -o ServerAliveCountMax=6
    -o TCPKeepAlive=yes
    -o ExitOnForwardFailure=yes
  )
  case "$SSH_IP_FAMILY" in
    4) base_ssh_opts+=(-4) ;;
    6) base_ssh_opts+=(-6) ;;
    auto) ;;
  esac

  if [ "$SSH_RETRY_COUNT" -lt 1 ]; then
    SSH_RETRY_COUNT=1
  fi
  if [ "$SSH_RETRY_DELAY" -lt 0 ]; then
    SSH_RETRY_DELAY=0
  fi

  if $DRY_RUN; then
    warn "DRY-RUN: ${stage}"
    return 0
  fi

  while (( attempt <= SSH_RETRY_COUNT )); do
    if output="$({
      for var_name in "$@"; do
        printf 'export %s=%q\n' "$var_name" "${!var_name}"
      done
      cat
    } | {
      local -a ssh_cmd=(ssh "${base_ssh_opts[@]}")
      [ -n "$SSH_KEY" ] && ssh_cmd+=(-i "$SSH_KEY")
      ssh_cmd+=("$SSH_HOST" "bash -s")
      "${ssh_cmd[@]}"
    } 2>&1)"; then
      printf '%s\n' "$output"
      return 0
    else
      rc=$?
      warn "SSH 执行失败（${stage}，第 ${attempt}/${SSH_RETRY_COUNT} 次）: 退出码 ${rc}"
      printf '%s\n' "$output"
      if [ "$rc" -ne 255 ]; then
        err "${stage} 执行失败（非连接问题）"
        return "$rc"
      fi
      if (( attempt >= SSH_RETRY_COUNT )); then
      warn "建议复现: ssh -vvv -o ConnectTimeout=${SSH_CONNECT_TIMEOUT} -o ServerAliveInterval=10 -o ServerAliveCountMax=6 ${SSH_KEY:+-i \"$SSH_KEY\"} \"$SSH_HOST\" 'echo ok'"
      err "${stage} 连接失败（已重试 ${SSH_RETRY_COUNT} 次）"
      return 255
      fi
      warn "将在 ${SSH_RETRY_DELAY}s 后重试（${stage}）"
      sleep "$SSH_RETRY_DELAY"
      ((attempt++))
    fi
  done
  return 1
}

preflight_plan() {
  log "执行计划"
  log "  目标主机: $SSH_HOST"
  log "  SSH key : ${SSH_KEY:-<default>}"
  log "  远端目录: $REMOTE_DIR"
  log "  部署用户: $DEPLOY_USER"
  log "  部署家目录: $DEPLOY_HOME"
  log "  SSH连接: timeout=${SSH_CONNECT_TIMEOUT}s, 重试=${SSH_RETRY_COUNT}, 间隔=${SSH_RETRY_DELAY}s, 地址族=${SSH_IP_FAMILY}"
  log "  PostgreSQL: $INSTALL_POSTGRES (v$POSTGRES_VERSION)"
  log "  Node.js: $INSTALL_NODE (v$NODE_VERSION)"
  log "  pnpm: $PNPM_VERSION (install when missing or different)"
  log "  Go: $INSTALL_GO (v$GO_VERSION)"
  log "  nginx: $INSTALL_NGINX"
  log "  Redis: $INSTALL_REDIS"
  log "  ufw: $SETUP_FIREWALL"
  log "  DRY_RUN: $DRY_RUN"
  log "  VERIFY_ONLY: $VERIFY_ONLY"
}

phase_connectivity() {
  log "阶段1: 连接与基础能力检查"
  if $DRY_RUN; then return 0; fi
run_remote "connectivity" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

if [ ! -f /etc/os-release ]; then
  echo "不支持的系统：缺少 /etc/os-release" >&2
  exit 1
fi

. /etc/os-release
ID_LC="${ID,,}"
if [ "$ID_LC" != "ubuntu" ] && [ "$ID_LC" != "debian" ]; then
  echo "当前脚本优先支持 Ubuntu/Debian，检测到系统: $ID" >&2
  exit 1
fi

run_as_root test -x /usr/bin/apt-get
run_as_root test -x /usr/bin/ssh
command -v bash >/dev/null
command -v curl >/dev/null
run_as_root lsb_release -dc 2>/dev/null || run_as_root cat /etc/os-release | tr '\n' ' '
echo "os=$ID $VERSION_ID ${VERSION_CODENAME:-unknown}"
run_as_root systemctl is-system-running --wait || true
run_as_root dpkg -l | wc -l | awk '{print "installed_packages="$1}'
echo "remote-host-ready=1"
REMOTE
}

phase_base_packages() {
  log "阶段2: 安装基础依赖"
  if $DRY_RUN; then return 0; fi
run_remote "base-packages" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

BASE_PACKAGES=(
  ca-certificates
  curl
  wget
  git
  rsync
  jq
  openssl
  build-essential
  pkg-config
  python3
  python3-venv
  net-tools
  iproute2
  lsb-release
  gnupg
  ca-certificates
  software-properties-common
  unzip
  zip
  xz-utils
  acl
  fail2ban
)

run_as_root apt-get update
TO_INSTALL=()
for pkg in "${BASE_PACKAGES[@]}"; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "[base] skip installed: $pkg"
  else
    TO_INSTALL+=("$pkg")
  fi
done

if [ "${#TO_INSTALL[@]}" -gt 0 ]; then
  run_as_root apt-get install -y --no-install-recommends "${TO_INSTALL[@]}"
fi

run_as_root apt-get clean
run_as_root rm -rf /var/lib/apt/lists/*
run_as_root systemctl restart fail2ban || true
run_as_root systemctl enable fail2ban || true
echo "base-packages-ok=1"
REMOTE
}

phase_node() {
  if [ "$INSTALL_NODE" != "true" ]; then
    log "阶段3: 跳过 Node.js 安装 (--skip-node)"
    return 0
  fi
  log "阶段3: 安装/校验 Node.js 与 pnpm"
  if $DRY_RUN; then return 0; fi
run_remote "node-runtime" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

NODE_DIST="https://nodejs.org/dist/v${NODE_VERSION}"
NODE_ARCH="linux-x64"
case "$(uname -m)" in
  x86_64|amd64) NODE_ARCH="linux-x64" ;;
  aarch64|arm64) NODE_ARCH="linux-arm64" ;;
  *) echo "不支持的 CPU 架构：$(uname -m)" >&2; exit 1 ;;
esac
NODE_TARBALL="node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
NODE_DIR="/usr/local/node-v${NODE_VERSION}-${NODE_ARCH}"
TMP_DIR="$(mktemp -d /tmp/aurocreator-node-bootstrap.XXXXXX 2>/dev/null || true)"
if [ -z "$TMP_DIR" ] || [ ! -d "$TMP_DIR" ]; then
  TMP_DIR="$(mktemp -d /var/tmp/aurocreator-node-bootstrap.XXXXXX)"
fi
rm -f "$TMP_DIR/$NODE_TARBALL" "$TMP_DIR/SHASUMS256.txt"

need_node=true
if command -v node >/dev/null 2>&1; then
  NODE_CUR="$(node -v 2>/dev/null || true)"
  if [ "$NODE_CUR" = "v${NODE_VERSION}" ]; then
    echo "[node] existing version $NODE_CUR 满足要求"
    need_node=false
  else
    echo "[node] 当前 Node.js 版本不匹配（已安装 ${NODE_CUR:-none}，目标 v${NODE_VERSION}），将重装"
  fi
fi

if [ "$need_node" = "true" ]; then
  if ! curl --fail --location --retry 4 --retry-delay 2 --retry-all-errors --max-time 120 \
    "${NODE_DIST}/$NODE_TARBALL" -o "$TMP_DIR/$NODE_TARBALL"; then
    echo "Node 下载失败：${NODE_DIST}/$NODE_TARBALL" >&2
    exit 1
  fi
  if ! curl --fail --location --retry 4 --retry-delay 2 --retry-all-errors --max-time 120 \
    "${NODE_DIST}/SHASUMS256.txt" -o "$TMP_DIR/SHASUMS256.txt"; then
    echo "Node checksum 下载失败" >&2
    exit 1
  fi
  (cd "$TMP_DIR" && grep -F "$NODE_TARBALL" SHASUMS256.txt | sha256sum -c -)
  run_as_root rm -rf "$NODE_DIR"
  # 清理其它残留的 node 版本目录（升级时的旧版本/损坏目录）
  for d in /usr/local/node-v*; do
    [ "$d" = "$NODE_DIR" ] && continue
    run_as_root rm -rf "$d"
  done
  run_as_root tar -C /usr/local -xJf "$TMP_DIR/$NODE_TARBALL"
  run_as_root ln -sfn "$NODE_DIR" /usr/local/node-current
  run_as_root ln -snf /usr/local/node-current/bin/node /usr/local/bin/node
  run_as_root ln -snf /usr/local/node-current/bin/npm /usr/local/bin/npm
  run_as_root ln -snf /usr/local/node-current/bin/corepack /usr/local/bin/corepack
fi

if ! command -v npm >/dev/null; then
  err "[node] npm not found（Node 安装不完整）"
  exit 1
fi

export PNPM_CONFIG_UPDATE_NOTIFIER=false
PNPN_OK=false
if command -v pnpm >/dev/null 2>&1; then
  CURRENT_PNPM="$(pnpm -v 2>/dev/null || true)"
  if [ "$CURRENT_PNPM" = "$PNPM_VERSION" ]; then
    PNPN_OK=true
  fi
fi
if [ "$PNPN_OK" != "true" ]; then
  echo "[node] 通过 npm 安装 pnpm@${PNPM_VERSION}（绕过 corepack 签名校验已知问题）"
  # 清理可能残留的损坏 pnpm 目录，避免 npm 重装时 ENOTEMPTY
  run_as_root rm -rf "$(run_as_root npm root -g 2>/dev/null)/pnpm" 2>/dev/null || true
  run_as_root rm -f /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/pnpm-store 2>/dev/null || true
  run_as_root npm install -g --force "pnpm@${PNPM_VERSION}"
  for b in pnpm pnpx pnpm-store; do
    if [ -x "/usr/local/node-current/bin/$b" ]; then
      run_as_root ln -snf "/usr/local/node-current/bin/$b" "/usr/local/bin/$b"
    fi
  done
fi

node -v
CURRENT_PNPM="$(pnpm -v)"
if [ "$CURRENT_PNPM" != "$PNPM_VERSION" ]; then
  err "[node] pnpm version mismatch: $CURRENT_PNPM (expected $PNPM_VERSION)"
  exit 1
fi
echo "pnpm runtime accepted: $CURRENT_PNPM"
rm -rf "$TMP_DIR"
echo "node-ok=1"
REMOTE
}

phase_go() {
  if [ "$INSTALL_GO" != "true" ]; then
    log "阶段4: 跳过 Go 安装 (--skip-go)"
    return 0
  fi
  log "阶段4: 安装/校验 Go（仅在需要本机编译时启用）"
  if $DRY_RUN; then return 0; fi
run_remote "go-runtime" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

GO_DIST="https://go.dev/dl"
GO_ARCH="linux-amd64"
case "$(uname -m)" in
  x86_64|amd64) GO_ARCH="linux-amd64" ;;
  aarch64|arm64) GO_ARCH="linux-arm64" ;;
  *) echo "不支持的 CPU 架构：$(uname -m)" >&2; exit 1 ;;
esac
GO_TARBALL="go${GO_VERSION}.${GO_ARCH}.tar.gz"
GO_TARBALL_SHA="$GO_TARBALL.sha256"
TMP_DIR="$(mktemp -d /tmp/aurocreator-go-bootstrap.XXXXXX 2>/dev/null || true)"
if [ -z "$TMP_DIR" ] || [ ! -d "$TMP_DIR" ]; then
  TMP_DIR="$(mktemp -d /var/tmp/aurocreator-go-bootstrap.XXXXXX)"
fi
rm -f "$TMP_DIR/$GO_TARBALL" "$TMP_DIR/$GO_TARBALL_SHA"

need_go=true
if command -v go >/dev/null 2>&1; then
  GO_CUR="$(go version | awk '{print $3}' | sed 's/^go//')"
  if [ "$GO_CUR" = "$GO_VERSION" ]; then
    echo "[go] existing version go${GO_CUR} 满足需求"
    need_go=false
  else
    echo "[go] 当前版本 go${GO_CUR} 与目标 $GO_VERSION 不一致"
  fi
fi

if [ "$need_go" = "true" ]; then
  if ! curl --fail --location --retry 4 --retry-delay 2 --retry-all-errors --max-time 120 \
    "${GO_DIST}/$GO_TARBALL" -o "$TMP_DIR/$GO_TARBALL"; then
    echo "Go 下载失败：${GO_DIST}/$GO_TARBALL" >&2
    exit 1
  fi
  if ! curl --fail --location --retry 4 --retry-delay 2 --retry-all-errors --max-time 120 \
    "${GO_DIST}/$GO_TARBALL.sha256" -o "$TMP_DIR/$GO_TARBALL_SHA"; then
    echo "Go checksum 下载失败：${GO_DIST}/$GO_TARBALL.sha256" >&2
    exit 1
  fi
  (cd "$TMP_DIR" && sed "s#  $GO_TARBALL##" "$GO_TARBALL_SHA" | head -n1 | sha256sum -c -)
  run_as_root rm -rf /usr/local/go
  run_as_root tar -C /usr/local -xzf "$TMP_DIR/$GO_TARBALL"
fi

go version
rm -rf "$TMP_DIR"
echo "go-ok=1"
REMOTE
}

phase_postgres() {
  if [ "$INSTALL_POSTGRES" != "true" ]; then
    log "阶段5: 跳过 PostgreSQL 安装 (--skip-postgres)"
    return 0
  fi
  log "阶段5: 安装 PostgreSQL（含 pgvector）"
  if $DRY_RUN; then return 0; fi
run_remote "postgres" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

. /etc/os-release
CODENAME="${VERSION_CODENAME:-n/a}"
if [ -z "$CODENAME" ]; then
  if [ -x /usr/bin/lsb_release ]; then
    CODENAME="$(lsb_release -sc)"
  else
    CODENAME="n/a"
  fi
fi

if [ "${CODENAME}" != "n/a" ]; then
  PGDG_KEY="/etc/apt/keyrings/pgdg.gpg"
  PGDG_LIST="/etc/apt/sources.list.d/pgdg.list"
  if [ ! -f "$PGDG_KEY" ]; then
    run_as_root mkdir -p /etc/apt/keyrings
    curl -fsSL "https://www.postgresql.org/media/keys/ACCC4CF8.asc" | gpg --dearmor | run_as_root tee "$PGDG_KEY" >/dev/null
  fi
  if [ ! -f "$PGDG_LIST" ] || ! grep -q "apt.postgresql.org" "$PGDG_LIST"; then
    run_as_root bash -c "cat >/etc/apt/sources.list.d/pgdg.list <<'EOF'
deb [signed-by=$PGDG_KEY] https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main
EOF"
  fi
fi

run_as_root apt-get update
if apt-cache policy "postgresql-${POSTGRES_VERSION}" >/dev/null 2>&1; then
  run_as_root apt-get install -y --no-install-recommends "postgresql-${POSTGRES_VERSION}" "postgresql-contrib" "postgresql-${POSTGRES_VERSION}-pgvector" "postgresql-client-${POSTGRES_VERSION}"
else
  echo "APT 源未提供 postgresql-${POSTGRES_VERSION}，回退安装仓库默认 PostgreSQL"
  run_as_root apt-get install -y --no-install-recommends postgresql postgresql-contrib
fi

run_as_root systemctl daemon-reload
run_as_root systemctl enable --now postgresql
run_as_root systemctl is-active postgresql
run_as_root pg_isready
echo "postgres-ok=1"
REMOTE
}

phase_redis() {
  if [ "$INSTALL_REDIS" != "true" ]; then
    log "阶段5.5: 跳过 Redis 安装 (--skip-redis)"
    return 0
  fi
  log "阶段5.5: 安装 Redis（仅监听 loopback）"
  if $DRY_RUN; then return 0; fi
run_remote "redis" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

if dpkg -s redis-server >/dev/null 2>&1; then
  echo "[redis] skip installed: redis-server"
else
  run_as_root apt-get update
  run_as_root apt-get install -y --no-install-recommends redis-server
fi

REDIS_CONF="/etc/redis/redis.conf"
if [ -f "$REDIS_CONF" ]; then
  run_as_root sed -i -E 's/^#?[[:space:]]*bind[[:space:]]+.*/bind 127.0.0.1 ::1/' "$REDIS_CONF"
  run_as_root sed -i -E 's/^#?[[:space:]]*protected-mode[[:space:]]+.*/protected-mode yes/' "$REDIS_CONF"
fi

run_as_root systemctl daemon-reload
run_as_root systemctl enable --now redis-server
run_as_root systemctl is-active redis-server
redis-cli ping
echo "redis-ok=1"
REMOTE
}

phase_nginx() {
  if [ "$INSTALL_NGINX" != "true" ]; then
    log "阶段6: 跳过 nginx 安装 (--skip-nginx)"
    return 0
  fi
  log "阶段6: 安装 nginx 与 certbot 依赖（仅部署到 HTTPS 站点前准备）"
  if $DRY_RUN; then return 0; fi
run_remote "nginx-runtime" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

NGINX_PACKAGES=(nginx certbot python3-certbot-nginx)

run_as_root apt-get update
TO_INSTALL=()
for pkg in "${NGINX_PACKAGES[@]}"; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "[nginx] skip installed: $pkg"
  else
    TO_INSTALL+=("$pkg")
  fi
done

if [ "${#TO_INSTALL[@]}" -gt 0 ]; then
  run_as_root apt-get install -y --no-install-recommends "${TO_INSTALL[@]}"
fi

run_as_root install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled
if [ -L /etc/nginx/sites-enabled/default ]; then
  run_as_root rm -f /etc/nginx/sites-enabled/default
fi
  echo "nginx-ok=1"
REMOTE
}

phase_runtime_layout() {
  log "阶段7: 目录、用户与敏感目录准备"
  if $DRY_RUN; then return 0; fi
run_remote "runtime-layout" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

if ! getent group "$DEPLOY_USER" >/dev/null; then
  run_as_root groupadd --system "$DEPLOY_USER"
fi
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  run_as_root useradd --system --gid "$DEPLOY_USER" --create-home --home-dir "$DEPLOY_HOME" --shell /usr/sbin/nologin "$DEPLOY_USER"
fi
if ! getent group aurocreator-sales >/dev/null; then
  run_as_root groupadd --system aurocreator-sales
fi
if ! id aurocreator-sales >/dev/null 2>&1; then
  run_as_root useradd --system --gid aurocreator-sales --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin aurocreator-sales
fi
if ! getent group aurocreator-egress >/dev/null; then
  run_as_root groupadd --system aurocreator-egress
fi
if ! id aurocreator-egress >/dev/null 2>&1; then
  run_as_root useradd --system --gid aurocreator-egress --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin aurocreator-egress
fi

run_as_root mkdir -p \
  "$REMOTE_DIR" \
  "$REMOTE_DIR/incoming" \
  "$REMOTE_DIR/build" \
  "$REMOTE_DIR/build/src" \
  "$REMOTE_DIR/server-releases" \
  "$REMOTE_DIR/web-releases" \
  "$REMOTE_DIR/daemon-releases" \
  /etc/aurocreator \
  /var/log/aurocreator \
  /var/empty \
  /app/data/uploads \
  "$DEPLOY_HOME"
run_as_root chown -R "$DEPLOY_USER:$DEPLOY_USER" "$REMOTE_DIR" "$DEPLOY_HOME"
run_as_root chmod 0755 "$REMOTE_DIR"
run_as_root chmod 0700 /etc/aurocreator /app/data/uploads /var/empty
run_as_root chown root:root /etc/aurocreator /var/log/aurocreator
run_as_root chmod 0700 /etc/aurocreator

if [ ! -s /etc/aurocreator/.pgpass ]; then
  run_as_root openssl rand -hex 24 | run_as_root tee /etc/aurocreator/.pgpass >/dev/null
  run_as_root chown root:root /etc/aurocreator/.pgpass
  run_as_root chmod 600 /etc/aurocreator/.pgpass
fi

if [ ! -s /etc/aurocreator/.jwt ]; then
  run_as_root openssl rand -hex 32 | run_as_root tee /etc/aurocreator/.jwt >/dev/null
  run_as_root chown root:root /etc/aurocreator/.jwt
  run_as_root chmod 600 /etc/aurocreator/.jwt
fi

echo "runtime-layout-ok=1"
REMOTE
}

phase_firewall() {
  if [ "$SETUP_FIREWALL" != "true" ]; then
    log "阶段8: 跳过防火墙 (--skip-firewall)"
    return 0
  fi
  log "阶段8: 设置 ufw（保守规则）"
  if $DRY_RUN; then return 0; fi
run_remote "firewall" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

run_as_root apt-get update
if ! dpkg -s ufw >/dev/null 2>&1; then
  run_as_root apt-get install -y --no-install-recommends ufw
fi

  SSH_PORT=22
  if command -v sshd >/dev/null 2>&1; then
    # sshd -T 在部分云镜像上会返回非零（pipefail 下会误杀整个阶段），用 || true 兜底
    SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')" || true
    if [ -n "$SSH_PORT" ]; then
      SSH_PORT="${SSH_PORT%% *}"
    fi
  fi
  if [ -z "$SSH_PORT" ] || [ "${#SSH_PORT}" -gt 5 ]; then
    SSH_PORT=22
  fi

run_as_root ufw allow "$SSH_PORT/tcp" comment "Allow SSH"
run_as_root ufw allow 80/tcp comment "AuroCreator HTTP"
run_as_root ufw allow 443/tcp comment "AuroCreator HTTPS"
run_as_root ufw allow 443/udp comment "AuroCreator HTTPS UDP"
run_as_root ufw default deny incoming
run_as_root ufw default allow outgoing
run_as_root ufw --force enable
echo "firewall-ok=1"
REMOTE
}

phase_verify() {
  log "阶段9: 最终验证"
  if $DRY_RUN; then return 0; fi
run_remote "verify" SSH_HOST APP_URL POSTGRES_VERSION NODE_VERSION NODE_MAJOR PNPM_VERSION GO_VERSION REMOTE_DIR DEPLOY_USER DEPLOY_HOME PUBLIC_IP <<'REMOTE'
set -Eeuo pipefail
run_as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi }

printf "node="; command -v node >/dev/null && node -v || echo "missing"
printf "pnpm="; command -v pnpm >/dev/null && pnpm -v || echo "missing"
printf "corepack="; command -v corepack >/dev/null && corepack -v || echo "missing"
printf "go="; command -v go >/dev/null && go version | awk '{print $3}' || echo "missing"
printf "psql="; command -v psql >/dev/null && psql --version || echo "missing"
printf "nginx="; command -v nginx >/dev/null && nginx -v 2>&1 | sed 's/^nginx version: //g' || echo "missing"
printf "pg_isready="; psql --version >/dev/null 2>&1 && pg_isready || echo "unavailable"
printf "deploy_user="; id "$DEPLOY_USER" || echo "missing"
printf "runtime_user="; id aurocreator-sales && id aurocreator-egress

run_as_root test -d /etc/aurocreator && ls -ld /etc/aurocreator
run_as_root test -d /var/log/aurocreator && ls -ld /var/log/aurocreator
run_as_root test -d "$REMOTE_DIR" && ls -ld "$REMOTE_DIR"
run_as_root test -f /etc/aurocreator/.pgpass && test -s /etc/aurocreator/.pgpass && echo "/etc/aurocreator/.pgpass=ready"
run_as_root test -f /etc/aurocreator/.jwt && test -s /etc/aurocreator/.jwt && echo "/etc/aurocreator/.jwt=ready"
echo "verify-ok=1"
REMOTE
}

if [ "$VERIFY_ONLY" = true ]; then
  preflight_plan
  phase_connectivity
  phase_verify
  exit 0
fi

if ! $FORCE; then
  if [ ! -t 0 ]; then
    err "非交互终端下请使用 --force 执行安装"
    exit 1
  fi
  read -r -p "确认执行 aurocreator 服务器环境部署？输入 yes 回车继续：" CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    warn "用户取消"
    exit 0
  fi
fi

preflight_plan
phase_connectivity
phase_base_packages
phase_node
phase_go
phase_postgres
phase_redis
phase_nginx
phase_runtime_layout
phase_firewall
phase_verify

ok "bootstrap 完成"
ok "建议下一步: ./scripts/deploy-aurocreator.sh bootstrap && ./scripts/deploy-aurocreator.sh harden && ./scripts/deploy-aurocreator.sh"
