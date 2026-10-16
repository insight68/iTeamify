# shellcheck shell=bash
# Shared deployment primitives. Sourced by scripts/deploy-aurocreator.sh.

# ============ 日志 ============
log()  { printf '\033[36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[32m[%s] ✓ %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[33m[%s] ! %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
err()  { printf '\033[31m[%s] ✗ %s\033[0m\n' "$(date +%H:%M:%S)" "$*" >&2; }

# ============ SSH / rsync ============
ssh_run() {
  local -a a=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ControlMaster=auto -o ControlPersist=600 -o ControlPath="$SSH_CONTROL_PATH")
  [ -n "$SSH_KEY" ] && a+=(-i "$SSH_KEY")
  ssh "${a[@]}" "$SSH_HOST" "$@"
}

ssh_exec() {
  local -a a=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ControlMaster=auto -o ControlPersist=600 -o ControlPath="$SSH_CONTROL_PATH")
  [ -n "$SSH_KEY" ] && a+=(-i "$SSH_KEY")
  ssh "${a[@]}" "$SSH_HOST" "bash -s"
}

ssh_exec_env() {
  local -a a=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ControlMaster=auto -o ControlPersist=600 -o ControlPath="$SSH_CONTROL_PATH")
  [ -n "$SSH_KEY" ] && a+=(-i "$SSH_KEY")
  local var_name
  {
    for var_name in "$@"; do
      printf 'export %s=%q\n' "$var_name" "${!var_name}"
    done
    cat
  } | ssh "${a[@]}" "$SSH_HOST" "bash -s"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  cleanup_build_tmp
  if [ "$LOCK_HELD" -eq 1 ]; then
    warn "检查并释放本次部署锁"
    ssh_exec_env DEPLOY_LOCK_DIR RELEASE_ID <<'REMOTE' >/dev/null 2>&1 || true
set -Eeuo pipefail
if sudo test -f "$DEPLOY_LOCK_DIR/owner" && sudo grep -Fxq "$RELEASE_ID" "$DEPLOY_LOCK_DIR/owner"; then
  case "$(sudo systemctl show "aurocreator-web-deploy-$RELEASE_ID.service" -p ActiveState --value 2>/dev/null || true)" in
    active|activating|deactivating|reloading)
      echo "Web 发布任务仍在运行，保留其部署锁" >&2
      exit 0 ;;
  esac
  sudo rm -f -- "$DEPLOY_LOCK_DIR/owner"
  sudo rmdir -- "$DEPLOY_LOCK_DIR"
fi
REMOTE
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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

# ============ 本机交叉编译产物（避免在目标主机上跑 go build 触发 OOM） ============
# 目标主机内存受限时，远端原生 go build 编译 aws-sdk-go-v2 等大包可能会触发 OOM Killer。
# 必然触发 OOM Killer 杀掉 sshd。改为本机交叉编译（CGO=0, GOOS=linux GOARCH=$GOARCH）
# 后打包 tar.gz，scp 上传到 incoming 目录，远端只做解包+migrate+activate。
BUILD_TMP=""

prepare_build_tmp() {
  [ -n "$BUILD_TMP" ] && return 0
  BUILD_TMP="$(mktemp -d "${TMPDIR:-/tmp}/aurocreator-deploy.XXXXXX")"
}

cleanup_build_tmp() {
  if [ -n "$BUILD_TMP" ] && [ -d "$BUILD_TMP" ]; then
    rm -rf -- "$BUILD_TMP"
  fi
}

require_cmd() { command -v "$1" >/dev/null || { err "找不到命令: $1"; return 1; }; }

# scp 上传构建产物到远端 incoming 目录。每个 release 拥有独立 0700 子目录。
upload_release_artifacts() {
  local -a files=("$@")
  local -a a=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ControlMaster=auto -o ControlPersist=600 -o ControlPath="$SSH_CONTROL_PATH")
  [ -n "$SSH_KEY" ] && a+=(-i "$SSH_KEY")
  ((${#files[@]} > 0)) || return 0
  log "upload: scp 推送 ${#files[@]} 个构建产物到 $REMOTE_DIR/incoming/$RELEASE_ID/"
  ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
install -d -m 0700 "$REMOTE_DIR/incoming/$RELEASE_ID"
REMOTE
  scp "${a[@]}" "${files[@]}" "$SSH_HOST:$REMOTE_DIR/incoming/$RELEASE_ID/"
  ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
sha256sum "$REMOTE_DIR/incoming/$RELEASE_ID"/* 2>/dev/null || true
REMOTE
  ok "upload 完成"
}

# ============ preflight ============
phase_preflight() {
  log "preflight: 检查本地文件、SSH 和服务器容量"
  [ -f "$LOCAL_DIR/pnpm-lock.yaml" ] || { err "找不到 pnpm-lock.yaml: $LOCAL_DIR"; return 1; }
  [ -f "$LOCAL_DIR/server/go.mod" ] || { err "找不到 server/go.mod: $LOCAL_DIR"; return 1; }
  if [ -n "$SSH_KEY" ]; then
    [ -r "$SSH_KEY" ] || { err "SSH Key 不可读: $SSH_KEY"; return 1; }
  else
    log "preflight: SSH_KEY 未设置，依赖 ~/.ssh/config 的 Host ${SSH_HOST}"
  fi
  case "$PORT_BACKEND" in *[!0-9]*|'') err "PORT_BACKEND 必须是有效端口: $PORT_BACKEND"; return 1 ;; esac
  case "$PORT_NEXT" in *[!0-9]*|'') err "PORT_NEXT 必须是有效端口: $PORT_NEXT"; return 1 ;; esac
  if [ "$PORT_BACKEND" -lt 1 ] || [ "$PORT_BACKEND" -gt 65535 ] ||
     [ "$PORT_NEXT" -lt 1 ] || [ "$PORT_NEXT" -gt 65535 ] ||
     [ "$PORT_BACKEND" -eq "$PORT_NEXT" ]; then
    err "backend/web 端口必须在 1-65535 且不能相同: $PORT_BACKEND/$PORT_NEXT"
    return 1
  fi
  local remote_arch
  remote_arch="$(ssh_run 'uname -m')"
  case "$remote_arch" in
    x86_64|amd64) remote_arch=amd64 ;;
    aarch64|arm64) remote_arch=arm64 ;;
    *) err "不支持的目标 CPU 架构: $remote_arch"; return 1 ;;
  esac
  if [ -z "$GOARCH" ]; then
    GOARCH="$remote_arch"
  elif [ "$GOARCH" != "$remote_arch" ]; then
    err "GOARCH=$GOARCH 与目标主机架构 $remote_arch 不一致"
    return 1
  fi
  ssh_run 'set -Eeuo pipefail; printf "connected: "; lsb_release -ds 2>/dev/null || true; printf "arch=%s cpu=%s ram=%s disk_free=%s\n" "$(uname -m)" "$(nproc)" "$(free -h | awk '\''/Mem:/{print $2}'\'')" "$(df -h / | awk '\''NR==2{print $4}'\'')"; command -v rsync >/dev/null; command -v node >/dev/null'
  ok "目标架构已确认: linux/$GOARCH"
  ok "preflight 完成"
}

phase_sync_go() {
  log "sync: 准备远端 release 根目录与 systemd unit"
  ssh_exec_env REMOTE_DIR DEPLOY_USER <<'REMOTE'
set -Eeuo pipefail
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
  "$REMOTE_DIR/server-releases" \
  "$REMOTE_DIR/daemon-releases"
REMOTE

  ok "release 根目录已准备"
}
