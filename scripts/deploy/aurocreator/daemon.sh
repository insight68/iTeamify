# shellcheck shell=bash
# CLI and daemon build, activation, rollback, and verification lifecycle.

# 本机交叉编译 iteamify CLI/daemon 二进制，打包 daemon.tar.gz。
build_daemon_binaries_local() {
  log "本机交叉编译 iteamify CLI/daemon（linux/${GOARCH}，CGO 关闭）"
  require_cmd go || return 1
  require_cmd tar || return 1
  require_cmd gzip || return 1
  prepare_build_tmp
  rm -rf -- "$BUILD_TMP/daemon"
  install -d "$BUILD_TMP/daemon"
  (
    cd "$LOCAL_DIR/server"
    LDFLAGS="-X main.version=$DEPLOY_VERSION -X main.commit=$DEPLOY_COMMIT -X main.date=$DEPLOY_DATE"
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -trimpath \
      -ldflags "-s -w $LDFLAGS" \
      -o "$BUILD_TMP/daemon/iteamify" ./cmd/iteamify
  ) || { err "iteamify CLI 交叉编译失败"; return 1; }
  COPYFILE_DISABLE=1 tar --no-xattrs -cf "$BUILD_TMP/daemon.tar" -C "$BUILD_TMP" daemon
  gzip -n "$BUILD_TMP/daemon.tar"
  ok "本机交叉编译完成: $BUILD_TMP/daemon.tar.gz"
}

# ============ Build and activate only the daemon/CLI/MCP runtime ============
phase_build_daemon_activate() {
  log "daemon build: Auro CLI + daemon + MCP（backend 与 Web 保持不变）"
  ssh_exec_env REMOTE_DIR RELEASE_ID DEPLOY_COMMIT DEPLOY_VERSION DEPLOY_DATE GO_VERSION RELEASE_KEEP DEPLOY_USER DEPLOY_HOME ITEAMIFY_DAEMON_SERVER_URL <<'REMOTE'
set -Eeuo pipefail

DAEMON_RELEASE_ROOT="$REMOTE_DIR/daemon-releases"
DAEMON_RELEASE_DIR="$DAEMON_RELEASE_ROOT/$RELEASE_ID"
DAEMON_CURRENT="$REMOTE_DIR/daemon-current"
DEPLOY_LOG="/var/log/aurocreator/daemon-deploy-$RELEASE_ID.log"
DAEMON_SERVICE_PATH="$DEPLOY_HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
DAEMON_CONFIG="$DEPLOY_HOME/.iteamify/config.json"
LEGACY_CURRENT="$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)"
LEGACY_CURRENT_BEFORE="$LEGACY_CURRENT"
PREVIOUS_DAEMON=""
if [ -L "$DAEMON_CURRENT" ]; then
  PREVIOUS_DAEMON="$(readlink -f "$DAEMON_CURRENT")"
else
  INSTALLED_CLI=""
  if [ -x /usr/local/bin/iteamify ]; then
    INSTALLED_CLI="$(readlink -f /usr/local/bin/iteamify)"
    PREVIOUS_DAEMON="$(dirname "$INSTALLED_CLI")"
  fi
fi
BACKEND_PID_BEFORE="$(sudo systemctl show aurocreator-backend -p MainPID --value)"
WEB_PID_BEFORE="$(sudo systemctl show aurocreator-web -p MainPID --value)"
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

daemon_release_is_rollback_candidate() {
  local release="$1"
  daemon_runtime_complete "$release" || return 1
  case "$release" in
    "$DAEMON_RELEASE_ROOT"/*)
      managed_daemon_release_complete "$release" &&
        [ -f "$release/.activated" ] &&
        [ ! -f "$release/.failed" ]
      ;;
    *)
      # Legacy installs predate release markers. A complete executable layout
      # remains a valid rollback target until the first managed activation.
      return 0
      ;;
  esac
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

validate_daemon_prerequisites() {
  sudo -u "$DEPLOY_USER" env HOME="$DEPLOY_HOME" python3 - \
    "$DAEMON_CONFIG" "$ITEAMIFY_DAEMON_SERVER_URL" <<'PY'
import json
import os
import stat
import sys

path, expected_server = sys.argv[1:]
try:
    file_stat = os.stat(path)
    with open(path, encoding="utf-8") as config_file:
        config = json.load(config_file)
except FileNotFoundError:
    raise SystemExit(
        "Daemon authentication is missing: {} does not exist; "
        "configure the production URL and run 'iteamify login' as the service user first".format(path)
    )
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit("Daemon config is unreadable or invalid: {}: {}".format(path, exc))

mode = stat.S_IMODE(file_stat.st_mode)
if mode & 0o077:
    raise SystemExit("Daemon config permissions are too broad: {} has mode {:o}, want 600".format(path, mode))
if not str(config.get("token", "")).strip():
    raise SystemExit("Daemon authentication token is missing from {}; run 'iteamify login' first".format(path))

configured_server = str(config.get("server_url", "")).strip().rstrip("/")
expected_server = expected_server.strip().rstrip("/")
if configured_server != expected_server:
    raise SystemExit(
        "Daemon server_url mismatch: configured {!r}, expected {!r}; "
        "run 'iteamify config set server_url {}' as the service user".format(
            configured_server, expected_server, expected_server
        )
    )
PY

  local auth_log="/tmp/aurocreator-daemon-auth-$RELEASE_ID.log"
  if ! sudo -u "$DEPLOY_USER" env \
      HOME="$DEPLOY_HOME" \
      PATH="$DAEMON_SERVICE_PATH" \
      ITEAMIFY_SERVER_URL="$ITEAMIFY_DAEMON_SERVER_URL" \
      "$DAEMON_RELEASE_DIR/iteamify" workspace list >"$auth_log" 2>&1; then
    echo "Daemon authentication preflight failed against $ITEAMIFY_DAEMON_SERVER_URL:" >&2
    tail -n 40 "$auth_log" >&2 || true
    return 1
  fi
  rm -f -- "$auth_log"

  local runtime_probe=""
  runtime_probe="$(sudo -u "$DEPLOY_USER" env \
    HOME="$DEPLOY_HOME" \
    PATH="$DAEMON_SERVICE_PATH" \
    ITEAMIFY_SERVER_URL="$ITEAMIFY_DAEMON_SERVER_URL" \
    "$DAEMON_RELEASE_DIR/iteamify" daemon probe-runtimes)"
  printf '%s' "$runtime_probe" | python3 -c '
import json, sys
probe = json.load(sys.stdin)
if probe.get("probe_result") != "success":
    raise SystemExit("daemon runtime probe did not succeed")
count = probe.get("runtime_count")
if not isinstance(count, int) or count < 1:
    raise SystemExit("no supported agent runtime is available in the systemd PATH")
'
  echo "Daemon prerequisites passed: server=$ITEAMIFY_DAEMON_SERVER_URL runtimes=$runtime_probe"
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
for workspace in health.get("workspaces") or []:
    registered = {item for item in workspace.get("registered_agents", []) if isinstance(item, str) and item}
    if not registered:
        print("workspace {} has no registered agent".format(workspace.get("id", "unknown")), file=sys.stderr)
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
  sudo ln -sfn "$DAEMON_CURRENT/iteamify" "$REMOTE_DIR/aurocreator-cli.new"
  sudo mv -Tf "$REMOTE_DIR/aurocreator-cli.new" "$REMOTE_DIR/aurocreator-cli"
  sudo ln -sfn "$REMOTE_DIR/aurocreator-cli" /usr/local/bin/iteamify.new
  sudo mv -Tf /usr/local/bin/iteamify.new /usr/local/bin/iteamify
}

rollback_daemon() {
  local reason="$1"
  local rollback_release=""
  echo "Daemon 激活失败，开始回滚：$reason" >&2

  if daemon_release_is_rollback_candidate "$PREVIOUS_DAEMON"; then
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
    sudo systemctl restart aurocreator-daemon || true
    wait_daemon_ready 45 || true
    echo "Daemon 回滚目标：$rollback_release" >&2
  else
    touch "$DAEMON_RELEASE_DIR/.failed" 2>/dev/null || true
    sudo systemctl disable --now aurocreator-daemon >/dev/null 2>&1 || true

    # A failed first activation has no known-good runtime to preserve. Remove
    # only links that resolve into this failed release, leaving the immutable
    # release directory and deploy log available for diagnosis.
    for link in /usr/local/bin/iteamify "$REMOTE_DIR/aurocreator-cli" "$DAEMON_CURRENT"; do
      [ -L "$link" ] || continue
      target="$(readlink -f "$link" 2>/dev/null || true)"
      case "$target" in
        "$DAEMON_RELEASE_DIR"|"$DAEMON_RELEASE_DIR"/*)
          sudo rm -f -- "$link"
          ;;
      esac
    done
    echo "没有找到已激活的 Daemon 回滚版本；已禁用服务并移除失败 release 的 current 链接" >&2
  fi
  sudo systemctl --no-pager --full status aurocreator-daemon || true
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
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

if [ -e "$DAEMON_RELEASE_DIR" ]; then
  echo "Daemon release 已存在，拒绝覆盖：$DAEMON_RELEASE_DIR" >&2
  exit 1
fi
# 首次部署时 daemon current 尚未创建：PREVIOUS_DAEMON 路径不存在，放过完整性检查。
if [ -e "$PREVIOUS_DAEMON" ] && ! daemon_runtime_complete "$PREVIOUS_DAEMON"; then
  echo "当前 Daemon/CLI 运行目录不完整，拒绝发布：$PREVIOUS_DAEMON" >&2
  exit 1
fi
install -d "$DAEMON_RELEASE_ROOT" "$DAEMON_RELEASE_DIR"
incoming="$REMOTE_DIR/incoming/$RELEASE_ID"
test -f "$incoming/daemon.tar.gz"
tar -xzf "$incoming/daemon.tar.gz" -C "$DAEMON_RELEASE_DIR" --strip-components=1
chmod 0755 "$DAEMON_RELEASE_DIR/iteamify"
run_logged "Auro CLI MCP smoke test" "/tmp/aurocreator-cli-mcp-$RELEASE_ID.log" \
  "$DAEMON_RELEASE_DIR/iteamify" mcp serve --help
CLI_SHA256="$(sha256sum "$DAEMON_RELEASE_DIR/iteamify" | awk '{print $1}')"
printf 'release=%s\nkind=daemon\ncommit=%s\nversion=%s\nbuilt_at=%s\nsha256=%s\n' \
  "$RELEASE_ID" "$DEPLOY_COMMIT" "$DEPLOY_VERSION" "$DEPLOY_DATE" "$CLI_SHA256" \
  >"$DAEMON_RELEASE_DIR/manifest"

# Never interrupt an active agent task during a daemon-only deployment. An
# existing daemon must be healthy and idle. A genuinely new installation has
# no prior release, CLI link, or systemd unit and may proceed without this gate.
if sudo systemctl is-active --quiet aurocreator-daemon; then
  DAEMON_HEALTH="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:19514/health)"
  printf '%s' "$DAEMON_HEALTH" | python3 -c '
import json, sys
health = json.load(sys.stdin)
active = health.get("active_task_count")
if active != 0:
    raise SystemExit("daemon has active tasks: {}".format(active))
'
elif daemon_release_is_rollback_candidate "$PREVIOUS_DAEMON"; then
  echo "检测到已有但未运行的 Daemon，拒绝覆盖；请先诊断或恢复现有 release" >&2
  exit 1
elif [ -n "$PREVIOUS_DAEMON" ]; then
  case "$PREVIOUS_DAEMON" in
    "$DAEMON_RELEASE_ROOT"/*)
      echo "检测到未激活的 Daemon release，按首次安装失败重试处理：$PREVIOUS_DAEMON"
      ;;
    *)
      echo "检测到未知的未运行 Daemon 布局，拒绝覆盖：$PREVIOUS_DAEMON" >&2
      exit 1
      ;;
  esac
else
  echo "未找到可回滚的已激活 Daemon release；按首次成功激活流程处理"
fi

# The daemon is user-scoped even when systemd supervises it. Validate the
# service user's stored token, effective API origin, and runtime discovery
# before changing any current pointer or service state.
validate_daemon_prerequisites
if ! sudo test -f /etc/aurocreator/generated/openagent-daemon.env; then
  echo "缺少 managed workspace daemon overlay；请先发布 server 或执行 aurocreator-config compile" >&2
  exit 1
fi

# Any failure after changing the systemd runtime target must trigger a daemon rollback.
ACTIVATED=1
sudo install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME"
sudo tee /etc/systemd/system/aurocreator-daemon.service >/dev/null <<UNIT
[Unit]
Description=Auro Agent Daemon
After=network-online.target aurocreator-backend.service
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_USER
WorkingDirectory=$DEPLOY_HOME
Environment=HOME=$DEPLOY_HOME
Environment=PATH=$DAEMON_SERVICE_PATH
Environment=ITEAMIFY_SERVER_URL=$ITEAMIFY_DAEMON_SERVER_URL
Environment=ITEAMIFY_DAEMON_AUTO_UPDATE=false
Environment=ITEAMIFY_DAEMON_SUPERVISOR=systemd
EnvironmentFile=/etc/aurocreator/generated/openagent-daemon.env
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
sudo systemctl enable aurocreator-daemon >/dev/null
sudo systemctl reset-failed aurocreator-daemon
sudo systemctl restart aurocreator-daemon
if ! wait_daemon_ready 45; then
  sudo journalctl -u aurocreator-daemon --since "$DEPLOY_DATE" -n 120 --no-pager >&2 || true
  exit 1
fi

BACKEND_PID_AFTER="$(sudo systemctl show aurocreator-backend -p MainPID --value)"
WEB_PID_AFTER="$(sudo systemctl show aurocreator-web -p MainPID --value)"
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

phase_verify_daemon() {
  log "daemon verify: CLI release、systemd 托管和 provider 注册"
  ssh_exec_env REMOTE_DIR DEPLOY_USER <<'REMOTE'
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

sudo systemctl is-active aurocreator-backend aurocreator-web aurocreator-daemon
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
sudo systemctl cat aurocreator-daemon | \
  grep -Fq "ExecStart=$REMOTE_DIR/daemon-current/iteamify daemon start --foreground"
sudo systemctl cat aurocreator-daemon | \
  grep -Fq 'EnvironmentFile=/etc/aurocreator/generated/openagent-daemon.env'
CONFIG_DIFF="$(sudo /usr/local/sbin/aurocreator-config diff --config /etc/aurocreator/config.yaml --credentials-dir /etc/aurocreator/credentials --output-dir /etc/aurocreator/generated)"
printf '%s\n' "$CONFIG_DIFF"
if printf '%s\n' "$CONFIG_DIFF" | awk '$1 != "unchanged" { bad=1 } END { exit bad }'; then :; else
  echo "生成的生产配置与 config.yaml/credentials 不一致" >&2
  exit 1
fi
"$INSTALLED_CLI" version
"$INSTALLED_CLI" mcp serve --help >/dev/null
DAEMON_HEALTH="$(curl --fail --silent --show-error http://127.0.0.1:19514/health)"
MANAGED_ENABLED="$(read_env_file_value /etc/aurocreator/generated/openagent-backend.env ITEAMIFY_OPENAGENT_ENABLED)"
MANAGED_PROVIDER=""
MANAGED_RUNTIME_EXPECTATIONS=""
if [ "$MANAGED_ENABLED" = "true" ]; then
  MANAGED_PROVIDER=openagent
  DAEMON_PID="$(sudo systemctl show aurocreator-daemon -p MainPID --value)"
  EXPECTED_DAEMON_ID="$(read_env_file_value /etc/aurocreator/generated/openagent-daemon.env ITEAMIFY_MANAGED_DAEMON_ID)"
  EXPECTED_DAEMON_TOKEN="$(read_env_file_value /etc/aurocreator/generated/openagent-daemon.env ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
  EFFECTIVE_DAEMON_ID="$(read_process_env_value "$DAEMON_PID" ITEAMIFY_MANAGED_DAEMON_ID)"
  EFFECTIVE_DAEMON_TOKEN="$(read_process_env_value "$DAEMON_PID" ITEAMIFY_MANAGED_DAEMON_SERVICE_TOKEN)"
  if [ -z "$EXPECTED_DAEMON_ID" ] || [ "${#EXPECTED_DAEMON_TOKEN}" -lt 32 ]; then
    echo "managed workspace daemon overlay 中 daemon 身份缺失或长度不合法" >&2
    exit 1
  fi
  if [ "$EFFECTIVE_DAEMON_ID" != "$EXPECTED_DAEMON_ID" ] || [ "$EFFECTIVE_DAEMON_TOKEN" != "$EXPECTED_DAEMON_TOKEN" ]; then
    echo "aurocreator-daemon 尚未加载生成配置中的 managed daemon 身份" >&2
    exit 1
  fi
  PW="$(sudo cat /etc/aurocreator/.pgpass)"
  MANAGED_RUNTIME_EXPECTATIONS="$(PGPASSWORD="$PW" psql "postgres://aurocreator@127.0.0.1:5432/aurocreator?sslmode=disable" \
    -X -v ON_ERROR_STOP=1 -F '|' -tAc "
      SELECT workspace_id::text, provider
      FROM agent_runtime
      WHERE daemon_id = '$EXPECTED_DAEMON_ID'
        AND provider = 'openagent'
      ORDER BY workspace_id, provider;
    ")"
  echo "managed_workspace_daemon_identity_ready=true"
elif [ "$MANAGED_ENABLED" = "false" ]; then
  echo "managed_workspace_daemon_identity_ready=disabled"
else
  echo "生成配置缺少明确的 managed workspace 开关" >&2
  exit 1
fi
printf '%s' "$DAEMON_HEALTH" | python3 -c '
import json, sys
health = json.load(sys.stdin)
if health.get("status") != "running" or health.get("supervisor") != "systemd":
    raise SystemExit("daemon is not ready under systemd")
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
echo "daemon_current=$DAEMON_TARGET"
cat "$DAEMON_TARGET/manifest"
echo "backend_pid=$(sudo systemctl show aurocreator-backend -p MainPID --value)"
echo "web_pid=$(sudo systemctl show aurocreator-web -p MainPID --value)"
printf '%s\n' "$DAEMON_HEALTH"
REMOTE
  ok "daemon 发布验证通过"
}

