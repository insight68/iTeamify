# shellcheck shell=bash
# Server build, migration, activation, rollback, and verification lifecycle.

# Cross-compile the config, backend, and migrate binaries and package migrations.
build_server_binaries_local() {
  log "本机交叉编译 3 个 Go 二进制（linux/${GOARCH}，CGO 关闭）"
  require_cmd go || return 1
  require_cmd tar || return 1
  require_cmd gzip || return 1
  prepare_build_tmp
  rm -rf -- "$BUILD_TMP/server"
  install -d "$BUILD_TMP/server/bin" "$BUILD_TMP/server/server/migrations"
  (
    cd "$LOCAL_DIR/server"
    LDFLAGS="-X main.version=$DEPLOY_VERSION -X main.commit=$DEPLOY_COMMIT -X main.date=$DEPLOY_DATE"
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -trimpath \
      -ldflags "-s -w -X main.version=$DEPLOY_VERSION" \
      -o "$BUILD_TMP/server/bin/aurocreator-config" ./cmd/site-config &
    p1=$!
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -trimpath \
      -ldflags "-s -w $LDFLAGS" \
      -o "$BUILD_TMP/server/bin/aurocreator-backend" ./cmd/server &
    p2=$!
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -trimpath -ldflags "-s -w" \
      -o "$BUILD_TMP/server/bin/aurocreator-migrate" ./cmd/migrate &
    p3=$!
    status=0
    wait "$p1" || status=$?
    wait "$p2" || status=$?
    wait "$p3" || status=$?
    [ "$status" -eq 0 ]
  ) || { err "Go backend 交叉编译失败"; return 1; }
  cp -a "$LOCAL_DIR/server/migrations/." "$BUILD_TMP/server/server/migrations/"
  COPYFILE_DISABLE=1 tar --no-xattrs -cf "$BUILD_TMP/server.tar" -C "$BUILD_TMP" server
  gzip -n "$BUILD_TMP/server.tar"
  ok "本机交叉编译完成: $BUILD_TMP/server.tar.gz"
}

phase_site_config_schema_preflight() {
  local expected_version
  expected_version="$(awk '/CurrentSchemaVersion[[:space:]]*=/ { print $3; exit }' "$LOCAL_DIR/server/internal/siteconfig/config.go")"
  case "$expected_version" in *[!0-9]*|'') err "无法读取当前站点配置 schema 版本"; return 1 ;; esac
  log "preflight: 检查生产站点配置 schema=v$expected_version"
  ssh_exec_env expected_version <<'REMOTE'
set -Eeuo pipefail
config=/etc/aurocreator/config.yaml
sudo test -f "$config" || exit 0
actual_version="$(sudo awk '$1 == "version:" { print $2; exit }' "$config")"
if [ "$actual_version" != "$expected_version" ]; then
  echo "生产站点配置 schema=v${actual_version:-unknown}，当前代码要求 v$expected_version。" >&2
  echo "先执行 config 阶段安装配置工具，再运行显式 schema 升级；拒绝在构建/解包后才失败。" >&2
  exit 1
fi
REMOTE
  ok "生产站点配置 schema 兼容"
}

phase_managed_daemon_environment_preflight() {
  log "preflight: 检查未发布 Daemon 的托管身份"
  ssh_exec <<'REMOTE'
set -Eeuo pipefail
backend_env=/etc/aurocreator/generated/openagent-backend.env
daemon_env=/etc/aurocreator/generated/openagent-daemon.env
config_tool=/usr/local/sbin/aurocreator-config

if ! sudo test -x "$config_tool" || ! sudo test -f "$backend_env" || ! sudo test -f "$daemon_env"; then
  echo "Server-only 发布要求现有配置工具和 managed workspace overlays 已就绪；请先执行 config/compile 或完整发布" >&2
  exit 1
fi

config_diff="$(sudo "$config_tool" diff \
  --config /etc/aurocreator/config.yaml \
  --credentials-dir /etc/aurocreator/credentials \
  --output-dir /etc/aurocreator/generated)"
if ! printf '%s\n' "$config_diff" | awk '$1 != "unchanged" { bad=1 } END { exit bad }'; then
  printf '%s\n' "$config_diff" >&2
  echo "生成配置与 config.yaml/credentials 不一致；Server-only 发布会令 Backend 与未重启 Daemon 使用不同环境" >&2
  exit 1
fi

managed_enabled="$(sudo awk -F= '$1 == "ITEAMIFY_OPENAGENT_ENABLED" { print $2 }' "$backend_env")"
case "$managed_enabled" in
  false)
    echo "managed_daemon_environment_preflight=disabled"
    ;;
  true)
    sudo systemctl is-active --quiet aurocreator-daemon || {
      echo "托管装配已启用，但 aurocreator-daemon 未运行；拒绝 Server-only 发布" >&2
      exit 1
    }
    daemon_pid="$(sudo systemctl show aurocreator-daemon -p MainPID --value)"
    case "$daemon_pid" in *[!0-9]*|'') echo "无法读取 aurocreator-daemon MainPID" >&2; exit 1 ;; esac
    [ "$daemon_pid" -gt 0 ] || { echo "aurocreator-daemon MainPID 无效" >&2; exit 1; }

    expected_value() {
      sudo awk -F= -v key="$1" '$1 == key { print substr($0, length(key) + 2) }' "$daemon_env"
    }
    effective_value() {
      sudo cat "/proc/$daemon_pid/environ" | tr '\0' '\n' |
        awk -F= -v key="$1" '$1 == key { print substr($0, length(key) + 2) }'
    }
    assert_loaded() {
      local key="$1" minimum_length="${2:-1}" expected effective
      expected="$(expected_value "$key")"
      effective="$(effective_value "$key")"
      if [ "${#expected}" -lt "$minimum_length" ]; then
        echo "$daemon_env 中 $key 缺失或长度不合法" >&2
        return 1
      fi
      if [ "$effective" != "$expected" ]; then
        echo "aurocreator-daemon 尚未加载生成配置中的 $key；请先在无活动任务时重启或发布 daemon" >&2
        return 1
      fi
    }

    assert_loaded ITEAMIFY_MANAGED_DAEMON_ID
    assert_loaded ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN 32
    echo "managed_daemon_environment_preflight=ready"
    ;;
  *)
    echo "生成配置缺少明确的 managed workspace 开关" >&2
    exit 1
    ;;
esac
REMOTE
  ok "未发布 Daemon 的托管环境已加载"
}

# ============ Build, migrate, and activate backend ============
phase_build_server_activate() {
  log "server build: Go backend + migrate（Web、daemon 与 CLI 保持不变）"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE GO_VERSION RELEASE_KEEP DEPLOY_USER DEPLOY_HOME PORT_BACKEND ITEAMIFY_APP_URL ITEAMIFY_CORS_ALLOWED_ORIGINS <<'REMOTE'
set -Eeuo pipefail

SERVER_RELEASE_ROOT="$REMOTE_DIR/server-releases"
SERVER_RELEASE_DIR="$SERVER_RELEASE_ROOT/$RELEASE_ID"
SERVER_CURRENT="$REMOTE_DIR/server-current"
DEPLOY_LOG="/var/log/aurocreator/server-deploy-$RELEASE_ID.log"
LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
LEGACY_CURRENT_BEFORE="$LEGACY_CURRENT"
PREVIOUS_BACKEND_PORT="$(sudo awk -F= '$1 == "PORT" {print $2; exit}' /etc/aurocreator/backend.env 2>/dev/null || true)"
PREVIOUS_SERVER=""
if [ -L "$SERVER_CURRENT" ]; then
  PREVIOUS_SERVER="$(readlink -f "$SERVER_CURRENT")"
else
  PREVIOUS_SERVER="$LEGACY_CURRENT"
fi
WEB_PID_BEFORE="$(sudo systemctl show aurocreator-web -p MainPID --value)"
DAEMON_PID_BEFORE="$(sudo systemctl show aurocreator-daemon -p MainPID --value 2>/dev/null || echo 0)"
CLI_TARGET_BEFORE="$(readlink -f /usr/local/bin/iteamify 2>/dev/null || true)"
ACTIVATED=0

server_runtime_complete() {
  local release="$1"
  [ -d "$release" ] &&
    [ -x "$release/bin/aurocreator-backend" ] &&
    [ -x "$release/bin/aurocreator-migrate" ] &&
    [ -d "$release/server/migrations" ] &&
    [ -f "$release/manifest" ] || return 1
  if grep -Fxq 'site_config_compiler=1' "$release/manifest"; then
    [ -x "$release/bin/aurocreator-config" ] || return 1
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
    echo "${file} 必须且只能配置一次 ${key}（当前 ${count} 次）" >&2
    return 1
  fi
  sudo awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' "$file"
}

validate_stripe_environment() {
  local file=/etc/aurocreator/backend.env key secret
  # Missing keys intentionally mean purchases are disabled. Never print values.
  key="$(sudo awk -F= '$1 == "STRIPE_SECRET_KEY" { n++; v=substr($0,index($0,"=")+1) } END { if(n>1) exit 2; print v }' "$file")" || return 1
  secret="$(sudo awk -F= '$1 == "STRIPE_WEBHOOK_SECRET" { n++; v=substr($0,index($0,"=")+1) } END { if(n>1) exit 2; print v }' "$file")" || return 1
  if [ -z "$key" ] && [ -z "$secret" ]; then
    echo "stripe_purchases=disabled"
    return
  fi
  case "$key" in sk_test_?*|sk_live_?*) ;; *) echo "STRIPE_SECRET_KEY 配置无效" >&2; return 1 ;; esac
  case "$secret" in whsec_?*) ;; *) echo "STRIPE_WEBHOOK_SECRET 必须与私钥一起配置" >&2; return 1 ;; esac
  if [ "$(sudo stat -c '%u:%a' "$file")" != "0:600" ]; then
    echo "$file 包含支付密钥，必须由 root 持有且权限为 0600" >&2
    return 1
  fi
}


assert_base64_32_bytes() {
  printf '%s' "$2" | python3 -c 'import base64,sys; value=sys.stdin.read(); assert len(base64.b64decode(value,validate=True))==32' || {
    echo "$1 must contain exactly 32 base64-encoded bytes" >&2
    return 1
  }
}

validate_openagent_environment() {
  local backend_env=/etc/aurocreator/generated/openagent-backend.env
  local daemon_env=/etc/aurocreator/generated/openagent-daemon.env
  sudo test -f "$backend_env"
  sudo test -f "$daemon_env"
  local enabled token
  token="$(env_value_once "$backend_env" ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
  enabled="$(env_value_once "$backend_env" ITEAMIFY_OPENAGENT_ENABLED)"
  case "$enabled" in
    true)
      test -n "$(env_value_once "$backend_env" ITEAMIFY_MANAGED_DAEMON_ID)"
      test "${#token}" -ge 32
      assert_base64_32_bytes ITEAMIFY_OPENAGENT_SECRET_KEY "$(env_value_once "$backend_env" ITEAMIFY_OPENAGENT_SECRET_KEY)"
      ;;
    false) ;;
    *) echo "OpenAgent enable flag must be true or false" >&2; return 1 ;;
  esac
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
    sudo systemctl restart aurocreator-backend || true
    wait_http "http://127.0.0.1:$PORT_BACKEND/readyz" 30 || true
    echo "Server 回滚目标：$rollback_release" >&2
  else
    echo "没有找到完整 Server 回滚版本；保留 server-current" >&2
  fi
  sudo systemctl --no-pager --full status aurocreator-backend || true
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
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

if [ -e "$SERVER_RELEASE_DIR" ]; then
  echo "Server release 已存在，拒绝覆盖：$SERVER_RELEASE_DIR" >&2
  exit 1
fi
# 首次部署时 current 与 backend unit 都未创建：PREVIOUS_SERVER 路径不存在，
# 跳过"上一次 release 完整性"和"backend 已运行"两项前置检查；
# 仅当 current 存在却不完整或服务未运行才拒绝，避免覆盖损坏的 release。
if [ -e "$PREVIOUS_SERVER" ] && ! server_runtime_complete "$PREVIOUS_SERVER"; then
  echo "当前 Server 运行目录不完整，拒绝发布：$PREVIOUS_SERVER" >&2
  exit 1
fi
if [ -e "$PREVIOUS_SERVER" ]; then
  sudo systemctl is-active --quiet aurocreator-backend
  CURRENT_BACKEND_PORT="${PREVIOUS_BACKEND_PORT:-$PORT_BACKEND}"
  curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$CURRENT_BACKEND_PORT/readyz" >/dev/null
fi
install -d "$SERVER_RELEASE_ROOT" "$SERVER_RELEASE_DIR/bin" "$SERVER_RELEASE_DIR/server"
incoming="$REMOTE_DIR/incoming/$RELEASE_ID"
test -f "$incoming/server.tar.gz"
# tar 内已包含 bin/* 与 server/migrations/，--strip-components=1 去掉顶层 server/ 前缀
tar -xzf "$incoming/server.tar.gz" -C "$SERVER_RELEASE_DIR" --strip-components=1
chmod 0755 \
  "$SERVER_RELEASE_DIR/bin/aurocreator-backend" \
  "$SERVER_RELEASE_DIR/bin/aurocreator-migrate" \
  "$SERVER_RELEASE_DIR/bin/aurocreator-config"
sudo install -o root -g root -m 0755 \
  "$SERVER_RELEASE_DIR/bin/aurocreator-config" /usr/local/sbin/aurocreator-config
if ! sudo test -f /etc/aurocreator/config.yaml || ! sudo test -d /etc/aurocreator/credentials; then
  echo "缺少 /etc/aurocreator/config.yaml 或 /etc/aurocreator/credentials" >&2
  echo "配置工具已安装。请先执行：sudo /usr/local/sbin/aurocreator-config init --config /etc/aurocreator/config.yaml --credentials-dir /etc/aurocreator/credentials" >&2
  exit 1
fi
sudo "$SERVER_RELEASE_DIR/bin/aurocreator-config" compile --config /etc/aurocreator/config.yaml --credentials-dir /etc/aurocreator/credentials --output-dir /etc/aurocreator/generated
validate_openagent_environment
validate_stripe_environment
printf 'release=%s\nkind=server\ncommit=%s\nversion=%s\nbuilt_at=%s\nsite_config_compiler=1\n' \
  "$RELEASE_ID" "$DEPLOY_COMMIT" "$DEPLOY_VERSION" "$DEPLOY_DATE" \
  >"$SERVER_RELEASE_DIR/manifest"

PW="$(sudo cat /etc/aurocreator/.pgpass)"
export DATABASE_URL="postgres://aurocreator:${PW}@127.0.0.1:5432/aurocreator?sslmode=disable"
cd "$SERVER_RELEASE_DIR"
run_logged "database migrations" "/tmp/aurocreator-migrate-$RELEASE_ID.log" \
  ./bin/aurocreator-migrate up

# Runtime data must not live inside immutable releases.
sudo install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /app/data/uploads
if [ -d "$PREVIOUS_SERVER/data/uploads" ]; then
  sudo rsync -a --ignore-existing "$PREVIOUS_SERVER/data/uploads/" /app/data/uploads/
  sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" /app/data/uploads
fi
if sudo grep -q '^LOCAL_UPLOAD_DIR=' /etc/aurocreator/backend.env; then
  sudo sed -i 's|^LOCAL_UPLOAD_DIR=.*|LOCAL_UPLOAD_DIR=/app/data/uploads|' /etc/aurocreator/backend.env
else
  printf '%s\n' 'LOCAL_UPLOAD_DIR=/app/data/uploads' | sudo tee -a /etc/aurocreator/backend.env >/dev/null
fi
upsert_backend_env() {
  local key="$1"
  local value="$2"
  if sudo grep -q "^${key}=" /etc/aurocreator/backend.env; then
    sudo sed -i "s|^${key}=.*|${key}=${value}|" /etc/aurocreator/backend.env
  else
    printf '%s=%s\n' "$key" "$value" | sudo tee -a /etc/aurocreator/backend.env >/dev/null
  fi
}
upsert_backend_env SERVER_HOST 127.0.0.1
upsert_backend_env PORT "$PORT_BACKEND"
upsert_backend_env ITEAMIFY_APP_URL "$ITEAMIFY_APP_URL"
upsert_backend_env FRONTEND_ORIGIN "$ITEAMIFY_APP_URL"
upsert_backend_env CORS_ALLOWED_ORIGINS "$ITEAMIFY_CORS_ALLOWED_ORIGINS"
sudo chmod 600 /etc/aurocreator/backend.env

# Any failure after changing the systemd runtime target must trigger a server rollback.
ACTIVATED=1
sudo tee /etc/systemd/system/aurocreator-backend.service >/dev/null <<UNIT
[Unit]
Description=Auro Backend
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$SERVER_CURRENT
EnvironmentFile=/etc/aurocreator/backend.env
EnvironmentFile=/etc/aurocreator/generated/openagent-backend.env
ExecStart=$SERVER_CURRENT/bin/aurocreator-backend
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
sudo systemctl enable aurocreator-backend >/dev/null
sudo systemctl restart aurocreator-backend
if ! wait_http "http://127.0.0.1:$PORT_BACKEND/readyz" 60; then
  sudo journalctl -u aurocreator-backend -n 120 --no-pager >&2 || true
  exit 1
fi
if [ -n "$PREVIOUS_BACKEND_PORT" ] && [ "$PREVIOUS_BACKEND_PORT" != "$PORT_BACKEND" ] &&
   sudo test -f /etc/nginx/sites-available/aurocreator.conf; then
  sudo sed -i \
    "s#127.0.0.1:${PREVIOUS_BACKEND_PORT}#127.0.0.1:${PORT_BACKEND}#g" \
    /etc/nginx/sites-available/aurocreator.conf
  sudo nginx -t
  sudo systemctl reload nginx
fi
WEB_PID_AFTER="$(sudo systemctl show aurocreator-web -p MainPID --value)"
DAEMON_PID_AFTER="$(sudo systemctl show aurocreator-daemon -p MainPID --value 2>/dev/null || echo 0)"
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

phase_verify_server() {
  log "server verify: 后端 release、迁移和其他组件隔离状态"
  ssh_exec_env REMOTE_DIR DEPLOY_USER PORT_BACKEND <<'REMOTE'
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


sudo systemctl is-active postgresql aurocreator-backend aurocreator-web
SERVER_TARGET="$(readlink -f "$REMOTE_DIR/server-current")"
case "$SERVER_TARGET" in
  "$REMOTE_DIR"/server-releases/*) ;;
  *) echo "server-current 不在 server-releases 内：$SERVER_TARGET" >&2; exit 1 ;;
esac
test -x "$SERVER_TARGET/bin/aurocreator-backend"
test -x "$SERVER_TARGET/bin/aurocreator-migrate"
test -x "$SERVER_TARGET/bin/aurocreator-config"
test -d "$SERVER_TARGET/server/migrations"
test -s "$SERVER_TARGET/manifest"
grep -Fxq 'kind=server' "$SERVER_TARGET/manifest"
grep -Fxq 'site_config_compiler=1' "$SERVER_TARGET/manifest"
test "$(sudo systemctl show aurocreator-backend -p WorkingDirectory --value)" = "$REMOTE_DIR/server-current"
sudo systemctl cat aurocreator-backend.service | \
  grep -Fq 'EnvironmentFile=/etc/aurocreator/backend.env'
sudo systemctl cat aurocreator-backend.service | \
  grep -Fq 'EnvironmentFile=/etc/aurocreator/generated/openagent-backend.env'
sudo "$SERVER_TARGET/bin/aurocreator-config" validate --config /etc/aurocreator/config.yaml --credentials-dir /etc/aurocreator/credentials --output-dir /etc/aurocreator/generated
CONFIG_DIFF="$(sudo "$SERVER_TARGET/bin/aurocreator-config" diff --config /etc/aurocreator/config.yaml --credentials-dir /etc/aurocreator/credentials --output-dir /etc/aurocreator/generated)"
printf '%s\n' "$CONFIG_DIFF"
if printf '%s\n' "$CONFIG_DIFF" | awk '$1 != "unchanged" { bad=1 } END { exit bad }'; then :; else
  echo "生成的生产配置与 config.yaml/credentials 不一致" >&2
  exit 1
fi
grep -Fxq 'LOCAL_UPLOAD_DIR=/app/data/uploads' <(sudo cat /etc/aurocreator/backend.env)
grep -Fxq "PORT=$PORT_BACKEND" <(sudo cat /etc/aurocreator/backend.env)
grep -Fxq 'SERVER_HOST=127.0.0.1' <(sudo cat /etc/aurocreator/backend.env)
test -d /app/data/uploads
echo "server_current=$SERVER_TARGET"
cat "$SERVER_TARGET/manifest"
echo "backend_pid=$(sudo systemctl show aurocreator-backend -p MainPID --value)"
echo "web_pid=$(sudo systemctl show aurocreator-web -p MainPID --value)"
echo "daemon_pid=$(sudo systemctl show aurocreator-daemon -p MainPID --value)"
curl --fail --silent --show-error "http://127.0.0.1:$PORT_BACKEND/readyz"
echo
PW="$(sudo cat /etc/aurocreator/.pgpass)"
PGPASSWORD="$PW" psql "postgres://aurocreator@127.0.0.1:5432/aurocreator?sslmode=disable" \
  -X -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM schema_migrations;'
MANAGED_ENABLED="$(read_env_file_value /etc/aurocreator/generated/openagent-backend.env ITEAMIFY_OPENAGENT_ENABLED)"
case "$MANAGED_ENABLED" in
  true)
    BACKEND_PID="$(sudo systemctl show aurocreator-backend -p MainPID --value)"
    EXPECTED_DAEMON_ID="$(read_env_file_value /etc/aurocreator/generated/openagent-backend.env ITEAMIFY_MANAGED_DAEMON_ID)"
    EXPECTED_DAEMON_TOKEN="$(read_env_file_value /etc/aurocreator/generated/openagent-backend.env ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
    EFFECTIVE_DAEMON_ID="$(read_process_env_value "$BACKEND_PID" ITEAMIFY_MANAGED_DAEMON_ID)"
    EFFECTIVE_DAEMON_TOKEN="$(read_process_env_value "$BACKEND_PID" ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
    if [ -z "$EXPECTED_DAEMON_ID" ] || [ "${#EXPECTED_DAEMON_TOKEN}" -lt 32 ]; then
      echo "managed workspace backend overlay 中 daemon 身份缺失或长度不合法" >&2
      exit 1
    fi
    if [ "$EFFECTIVE_DAEMON_ID" != "$EXPECTED_DAEMON_ID" ] || [ "$EFFECTIVE_DAEMON_TOKEN" != "$EXPECTED_DAEMON_TOKEN" ]; then
      echo "aurocreator-backend 尚未加载生成配置中的 managed daemon 身份" >&2
      exit 1
    fi
    echo "managed_workspace_backend_identity_ready=true"
    ;;
  false) echo "managed_workspace_backend_identity_ready=disabled" ;;
  *) echo "生成配置缺少明确的 managed workspace 开关" >&2; exit 1 ;;
esac
REMOTE

  curl --fail --silent --show-error --max-time 15 "$ITEAMIFY_APP_URL/healthz" >/dev/null
  ok "$ITEAMIFY_APP_URL Server 发布验证通过"
}
