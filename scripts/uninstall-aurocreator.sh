#!/usr/bin/env bash
#
# Uninstall/clean all aurocreator deployment artifacts from a remote host.
#
# Safety notes:
# - Database/user cleanup is off by default and requires --purge-db.
# - Remote deletion is performed in a strict order: stop services -> disable units ->
#   remove unit files/config -> remove artifacts -> optional DB/users cleanup.
# - Always creates a backup tarball before cleanup (can be disabled with --skip-backup).
#
# Usage:
#   ./scripts/uninstall-aurocreator.sh [--host sshmd] [--remote-dir /opt/aurocreator] [options]

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"

SSH_HOST="${SSH_HOST:-sshmd}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/aurocreator}"
ITEAMIFY_APP_URL="${ITEAMIFY_APP_URL:-}"
NGINX_DOMAIN="${NGINX_DOMAIN:-}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/aurocreator-uninstall-backups}"
DRY_RUN=false
FORCE=false
SKIP_BACKUP=false
PURGE_DB=false
PURGE_USERS=false
PURGE_REMOTE_ROOT=true
PURGE_NGINX=true
PURGE_CERT=false
REMOVE_SYSTEMD_UNITS=true

log()  { printf '\033[36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[32m[%s] ✓ %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[33m[%s] ! %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
err()  { printf '\033[31m[%s] ✗ %s\033[0m\n' "$(date +%H:%M:%S)" "$*" >&2; }

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/uninstall-aurocreator.sh [options]

Core:
  --host <ssh-host>            SSH host (default: sshmd)
  --ssh-key <path>             SSH private key
  --remote-dir <path>          Remote install path (default: /opt/aurocreator)
  --app-url <url>              Used to derive nginx cert domain (optional)
  --domain <domain>            Nginx/cert domain (if omitted, derived from app-url)

Safety:
  --dry-run                    Print planned commands only
  --force/-y                   Skip interactive confirmation
  --skip-backup                Skip server-side backup tar before deletion
  --purge-db                   Drop aurocreator db/user (OFF by default)
  --purge-users                Remove service users aurocreator-sales/aurocreator-egress
  --purge-cert                 Remove cert for domain with certbot (requires known domain)
  --keep-nginx                 Keep nginx site links under /etc/nginx/sites-*
  --keep-remote-root            Keep remote directory itself (only remove known artifacts inside)
  --backup-dir <path>          Local backup directory (default: ~/aurocreator-uninstall-backups)

Example:
  ./scripts/uninstall-aurocreator.sh --purge-db --purge-users --purge-cert --force
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) SSH_HOST="${2:-}"; shift 2 ;;
    --ssh-key) SSH_KEY="${2:-}"; shift 2 ;;
    --remote-dir) REMOTE_DIR="${2:-}"; shift 2 ;;
    --app-url) ITEAMIFY_APP_URL="${2:-}"; shift 2 ;;
    --domain) NGINX_DOMAIN="${2:-}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force|-y) FORCE=true; shift ;;
    --skip-backup) SKIP_BACKUP=true; shift ;;
    --purge-db) PURGE_DB=true; shift ;;
    --purge-users) PURGE_USERS=true; shift ;;
    --purge-cert) PURGE_CERT=true; shift ;;
    --keep-nginx) PURGE_NGINX=false; shift ;;
    --keep-remote-root) PURGE_REMOTE_ROOT=false; shift ;;
    --keep-remote-dir) PURGE_REMOTE_ROOT=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "未知参数: $1"; usage; exit 1 ;;
  esac
done

if [ ! -n "$SSH_HOST" ]; then
  err "SSH host 不能为空"
  exit 1
fi

if [ -z "$NGINX_DOMAIN" ] && [ -n "$ITEAMIFY_APP_URL" ]; then
  NGINX_DOMAIN="${ITEAMIFY_APP_URL#http://}"
  NGINX_DOMAIN="${NGINX_DOMAIN#https://}"
  NGINX_DOMAIN="${NGINX_DOMAIN%%/*}"
fi

if [ "$PURGE_DB" = true ] && [ -z "$NGINX_DOMAIN" ] && [ -z "$ITEAMIFY_APP_URL" ]; then
  warn "已开启 --purge-db，但未提供任何域名参数；不影响 DB 清理，仅做提示。"
fi

if [ -z "$REMOTE_DIR" ]; then
  err "--remote-dir 不可为空"
  exit 1
fi

ssh_exec() {
  local -a cmd=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
  [ -n "$SSH_KEY" ] && cmd+=(-i "$SSH_KEY")
  ssh "${cmd[@]}" "$SSH_HOST" "$@"
}

scp_from_remote() {
  local src="$1"
  local dst="$2"
  local -a cmd=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
  [ -n "$SSH_KEY" ] && cmd+=(-i "$SSH_KEY")
  scp "${cmd[@]}" "$SSH_HOST:$src" "$dst"
}

run_remote() {
  local script
  script="$(cat)"

  if $DRY_RUN; then
    warn "DRY-RUN（远端将执行）:"
    while IFS= read -r line; do
      log "  $line"
    done <<< "$script"
    return 0
  fi

  {
    printf "set -Eeuo pipefail\n"
    printf "REMOTE_DIR=%q\n" "$REMOTE_DIR"
    printf "SSH_HOST=%q\n" "$SSH_HOST"
    printf "PURGE_DB=%q\n" "$PURGE_DB"
    printf "PURGE_USERS=%q\n" "$PURGE_USERS"
    printf "PURGE_REMOTE_ROOT=%q\n" "$PURGE_REMOTE_ROOT"
    printf "PURGE_NGINX=%q\n" "$PURGE_NGINX"
    printf "PURGE_CERT=%q\n" "$PURGE_CERT"
    printf "NGINX_DOMAIN=%q\n" "$NGINX_DOMAIN"
    printf "BACKUP_TAR=%q\n" "$REMOTE_BACKUP_TAR"
    printf "SKIP_BACKUP=%q\n" "$SKIP_BACKUP"
    printf "ITEAMIFY_APP_URL=%q\n" "$ITEAMIFY_APP_URL"
    printf "SUDO=\n"
    printf 'if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi\n'
    printf '%s\n' "$script"
  } | ssh_exec bash -s
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_name="aurocreator-uninstall-${timestamp}.tar.gz"
REMOTE_BACKUP_TAR="/tmp/$tmp_name"
LOCAL_BACKUP_TAR="$BACKUP_DIR/$tmp_name"

mkdir -p "$BACKUP_DIR"

log "执行计划"
log "  目标主机: $SSH_HOST"
log "  远端目录: $REMOTE_DIR"
log "  SSH key : ${SSH_KEY:-<default>}"
log "  DRY_RUN : $DRY_RUN"
log "  purge-db: $PURGE_DB"
log "  purge-users: $PURGE_USERS"
log "  purge-nginx: $PURGE_NGINX"
log "  purge-cert: $PURGE_CERT"
log "  purge-remote-root: $PURGE_REMOTE_ROOT"
log "  本地备份: $LOCAL_BACKUP_TAR"

if ! $FORCE; then
  if [ ! -t 0 ]; then
    err "非交互环境请使用 --force 跳过确认"
    exit 1
  fi
  read -r -p "确认要清理 aurocreator 全部部署内容吗？请输入 yes 回车继续：" CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    warn "用户取消"
    exit 0
  fi
fi

log "步骤1: 预检查并打点备份"
run_remote <<'REMOTE'
services=(aurocreator-backend aurocreator-web aurocreator-daemon)
service_files=(
  "/etc/systemd/system/aurocreator-backend.service"
  "/etc/systemd/system/aurocreator-web.service"
  "/etc/systemd/system/aurocreator-daemon.service"
)

echo "[preflight] 检查远端服务与路径"
for s in "${services[@]}"; do
  if $SUDO systemctl list-unit-files "${s}.service" >/dev/null 2>&1; then
    if $SUDO systemctl is-enabled "${s}.service" >/dev/null 2>&1; then
      echo "[preflight] service enabled: ${s}"
    else
      echo "[preflight] service exists (disabled): ${s}"
    fi
  else
    echo "[preflight] service not found: ${s}"
  fi
done

if [ ! -d "$REMOTE_DIR" ]; then
  echo "[preflight] warning: remote dir not found: $REMOTE_DIR"
fi

if [ "$SKIP_BACKUP" = "true" ]; then
  echo "[preflight] skip-backup true, skip creating remote backup"
  exit 0
fi

echo "[preflight] create remote backup: $BACKUP_TAR"
manifest="/tmp/aurocreator-uninstall-manifest-${BACKUP_TAR##*/}.txt"
{
  echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "ssh_host=${SSH_HOST}"
  echo "remote_dir=$REMOTE_DIR"
  echo "chimi_app_url=$ITEAMIFY_APP_URL"
  echo "nginx_domain=$NGINX_DOMAIN"
  for f in "${service_files[@]}"; do
    if [ -f "$f" ] || [ -L "$f" ]; then
      echo "FOUND service_file=$f"
    fi
  done
  for d in \
    /etc/aurocreator \
    /var/log/aurocreator \
    /usr/local/sbin/aurocreator-config \
    /usr/local/bin/iteamify \
    /etc/nginx/sites-available/aurocreator.conf \
    /etc/nginx/sites-enabled/aurocreator.conf \
    "$REMOTE_DIR"; do
    if [ -e "$d" ]; then
      echo "FOUND path=$d"
    fi
  done
} > "$manifest"

tar_items="$(mktemp)"
while IFS= read -r path; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    printf '%s\n' "$path" >> "$tar_items"
  fi
done < "$manifest"

if [ -s "$tar_items" ]; then
  $SUDO tar -czf "$BACKUP_TAR" -T "$tar_items" /dev/null
else
  $SUDO touch "$BACKUP_TAR"
fi
rm -f "$tar_items"
rm -f "$manifest"
ls -lh "$BACKUP_TAR"
echo "[preflight] backup-created: $BACKUP_TAR"
REMOTE

if [ "$SKIP_BACKUP" = "false" ]; then
  if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
  fi
  if ! $DRY_RUN; then
    log "步骤1.1: 拉取远端备份到本地"
    scp_from_remote "$REMOTE_BACKUP_TAR" "$LOCAL_BACKUP_TAR"
    log "备份保存: $LOCAL_BACKUP_TAR"
  else
    log "DRY-RUN: 备份会落盘到本地 $LOCAL_BACKUP_TAR"
  fi
fi

if [ "$PURGE_REMOTE_ROOT" = true ]; then
  log "步骤2: 停止服务并移除 aurocreator systemd 单元"
fi

run_remote <<'REMOTE'
services=(aurocreator-backend aurocreator-web aurocreator-daemon)
service_files=(
  "/etc/systemd/system/aurocreator-backend.service"
  "/etc/systemd/system/aurocreator-web.service"
  "/etc/systemd/system/aurocreator-daemon.service"
)

if [ "$PURGE_REMOTE_ROOT" = "true" ]; then
  echo "[cleanup] 目标开启了 purge-remote-root：将优先清理 $REMOTE_DIR 及相关配置"
fi

for s in "${services[@]}"; do
  if $SUDO systemctl list-unit-files "${s}.service" >/dev/null 2>&1; then
    if $SUDO systemctl is-active --quiet "${s}.service"; then
      echo "[cleanup] stop $s"
      $SUDO systemctl stop "${s}.service" || true
    fi
    echo "[cleanup] disable $s"
    $SUDO systemctl disable "${s}.service" || true
    $SUDO systemctl reset-failed "${s}.service" || true
  fi
done

for file in "${service_files[@]}"; do
  $SUDO rm -f "$file"
done

$SUDO rm -f /etc/systemd/system/multi-user.target.wants/aurocreator-*.service || true
$SUDO rm -f /etc/systemd/system/sockets.target.wants/aurocreator-*.service || true
$SUDO systemctl daemon-reload

echo "[cleanup] remove deployment binaries and env"
$SUDO rm -f /usr/local/sbin/aurocreator-config
$SUDO rm -f /etc/letsencrypt/renewal/aurocreator.conf || true

if [ -L /usr/local/bin/iteamify ]; then
  target="$($SUDO readlink -f /usr/local/bin/iteamify || true)"
  if [[ "$target" == "$REMOTE_DIR/"* ]]; then
    $SUDO rm -f /usr/local/bin/iteamify
  else
    echo "[cleanup] skip /usr/local/bin/iteamify: linked to $target, not under $REMOTE_DIR"
  fi
elif [ -e /usr/local/bin/iteamify ]; then
  echo "[cleanup] skip /usr/local/bin/iteamify: file is not symlink"
fi

$SUDO rm -rf /etc/aurocreator
$SUDO rm -rf /var/log/aurocreator
$SUDO rm -rf /tmp/aurocreator-uninstall-*.tar.gz

if [ "$PURGE_NGINX" = "true" ]; then
  echo "[cleanup] remove nginx site config"
  $SUDO rm -f /etc/nginx/sites-available/aurocreator.conf
  $SUDO rm -f /etc/nginx/sites-enabled/aurocreator.conf
  if [ -x /usr/sbin/nginx ] && $SUDO systemctl is-active --quiet nginx; then
    $SUDO nginx -t >/tmp/nginx-syntax-check.$$.log 2>&1 || true
    $SUDO systemctl reload nginx || $SUDO systemctl restart nginx || true
  fi
fi

if [ "$PURGE_CERT" = "true" ] && [ -n "$NGINX_DOMAIN" ] && command -v certbot >/dev/null 2>&1; then
  $SUDO certbot delete --non-interactive --cert-name "$NGINX_DOMAIN" || true
fi

if [ "$PURGE_REMOTE_ROOT" = "true" ]; then
  $SUDO rm -rf "$REMOTE_DIR"
else
  $SUDO rm -rf \
    "$REMOTE_DIR/server-releases" \
    "$REMOTE_DIR/web-releases" \
    "$REMOTE_DIR/daemon-releases" \
    "$REMOTE_DIR/server-current" \
    "$REMOTE_DIR/web-current" \
    "$REMOTE_DIR/daemon-current" \
    "$REMOTE_DIR/daemon" \
    "$REMOTE_DIR/incoming" \
    "$REMOTE_DIR/build" \
    "$REMOTE_DIR/releases" \
    "$REMOTE_DIR/current" \
    "$REMOTE_DIR/node_modules" \
    "$REMOTE_DIR/apps" \
    "$REMOTE_DIR/packages" \
    "$REMOTE_DIR/services" \
    "$REMOTE_DIR/deploy" \
    "$REMOTE_DIR/scripts" \
    "$REMOTE_DIR/.agents" \
    "$REMOTE_DIR/.github" \
    "$REMOTE_DIR/.serena" \
    "$REMOTE_DIR/.workbuddy" \
    "$REMOTE_DIR/.env" \
    "$REMOTE_DIR/.env.swp" \
    "$REMOTE_DIR/.env.example" \
    "$REMOTE_DIR/Makefile" \
    "$REMOTE_DIR/package.json" \
    "$REMOTE_DIR/pnpm-lock.yaml" \
    "$REMOTE_DIR/pnpm-workspace.yaml" \
    "$REMOTE_DIR/turbo.json" \
    "$REMOTE_DIR/SELF_HOSTING.md" \
    "$REMOTE_DIR/README.zh-CN.md" \
    "$REMOTE_DIR/LICENSE" \
    "$REMOTE_DIR/Dockerfile" \
    "$REMOTE_DIR/Dockerfile.web" \
    "$REMOTE_DIR/README.md" \
    "$REMOTE_DIR/SELF_HOSTING.md"
fi

if [ "$PURGE_DB" = "true" ]; then
  echo "[cleanup] drop aurocreator database and role (best effort)"
  if $SUDO -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='aurocreator'" | tr -d ' ' | grep -q 1; then
    $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='aurocreator' AND pid <> pg_backend_pid();"
    $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS aurocreator;"
  fi
  if $SUDO -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='aurocreator'" | tr -d ' ' | grep -q 1; then
    $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "DROP OWNED BY aurocreator;"
    $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS aurocreator;"
  fi
fi

if [ "$PURGE_USERS" = "true" ]; then
  for u in aurocreator-sales aurocreator-egress; do
    if id "$u" >/dev/null 2>&1; then
      echo "[cleanup] deleting user: $u"
      $SUDO userdel "$u" || true
    fi
    if getent group "$u" >/dev/null 2>&1; then
      echo "[cleanup] deleting group: $u"
      $SUDO groupdel "$u" || true
    fi
  done
fi

$SUDO rm -f "$BACKUP_TAR"
echo "[done] uninstall completed"
REMOTE

log "步骤3: 收敛/验证"
run_remote <<'REMOTE'
if command -v systemctl >/dev/null 2>&1; then
  if systemctl list-unit-files aurocreator-*.service >/dev/null 2>&1; then
    units="$(systemctl list-unit-files 'aurocreator-*.service' --state=enabled,disabled,static,generated,indirect,alias 2>/dev/null || true)"
    echo "$units"
  fi
  echo "[verify] remaining aurocreator services:"
  systemctl list-unit-files 'aurocreator-*' | cat || true
fi

if [ -d "$REMOTE_DIR" ]; then
  ls -la "$REMOTE_DIR" || true
else
  echo "[verify] remote_dir not exists: $REMOTE_DIR"
fi

if [ -d /etc/aurocreator ]; then
  echo "[verify] /etc/aurocreator still exists"
fi
if [ -f /usr/local/sbin/aurocreator-config ]; then
  echo "[verify] /usr/local/sbin/aurocreator-config still exists"
fi
if [ "$PURGE_NGINX" = "true" ]; then
  if [ -e /etc/nginx/sites-enabled/aurocreator.conf ] || [ -e /etc/nginx/sites-available/aurocreator.conf ]; then
    echo "[verify] nginx config still exists"
  fi
fi
echo "[verify] done"
REMOTE

ok "清理已执行完成。"
if [ "$SKIP_BACKUP" = "false" ]; then
  ok "已完成本地备份: $LOCAL_BACKUP_TAR"
fi
