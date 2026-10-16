# shellcheck shell=bash
# Explicit config, bootstrap, hardening, pruning, and unlock operations.

# 本机交叉编译 aurocreator-config 工具，打包 config-tool.tar.gz。
build_config_tool_local() {
  log "本机交叉编译 aurocreator-config 工具（linux/${GOARCH}，CGO 关闭）"
  require_cmd go || return 1
  require_cmd tar || return 1
  require_cmd gzip || return 1
  prepare_build_tmp
  rm -rf -- "$BUILD_TMP/config"
  install -d "$BUILD_TMP/config"
  (
    cd "$LOCAL_DIR/server"
    CGO_ENABLED=0 GOOS=linux GOARCH=$GOARCH go build -trimpath \
      -ldflags "-s -w -X main.version=$DEPLOY_VERSION" \
      -o "$BUILD_TMP/config/aurocreator-config" ./cmd/site-config
  ) || { err "aurocreator-config 工具交叉编译失败"; return 1; }
  COPYFILE_DISABLE=1 tar --no-xattrs -cf "$BUILD_TMP/config-tool.tar" -C "$BUILD_TMP" config
  gzip -n "$BUILD_TMP/config-tool.tar"
  ok "本机交叉编译完成: $BUILD_TMP/config-tool.tar.gz"
}

# ============ 首次数据库初始化（不属于普通发布） ============
phase_bootstrap() {
  log "bootstrap: 在已安装的 PostgreSQL 上创建 aurocreator 库/用户/扩展与实例密钥"
  ssh_exec <<'REMOTE'
set -Eeuo pipefail

# 目标主机上 PostgreSQL 已由管理员安装并运行；本阶段只创建本实例的库与用户，
# 不改写 postgresql.conf / pg_hba.conf（共享 PG，避免影响其他实例）。
command -v psql >/dev/null || { echo "psql 未找到：请先在目标主机安装 PostgreSQL" >&2; exit 1; }
sudo systemctl enable --now postgresql >/dev/null 2>&1 || true
sudo install -d -m 700 /etc/aurocreator

if ! sudo test -s /etc/aurocreator/.pgpass; then
  openssl rand -hex 24 | sudo tee /etc/aurocreator/.pgpass >/dev/null
  sudo chmod 600 /etc/aurocreator/.pgpass
fi
if ! sudo test -s /etc/aurocreator/.jwt; then
  openssl rand -hex 32 | sudo tee /etc/aurocreator/.jwt >/dev/null
  sudo chmod 600 /etc/aurocreator/.jwt
fi
PW="$(sudo cat /etc/aurocreator/.pgpass)"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='aurocreator'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER aurocreator WITH PASSWORD '$PW'"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='aurocreator'" | grep -q 1 \
  || sudo -u postgres createdb -O aurocreator aurocreator
sudo -u postgres psql -c "ALTER USER aurocreator WITH PASSWORD '$PW'" >/dev/null
sudo -u postgres psql -d aurocreator -c "CREATE EXTENSION IF NOT EXISTS vector"
sudo -u postgres psql -d aurocreator -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
sudo -u postgres psql -d aurocreator -c "CREATE EXTENSION IF NOT EXISTS btree_gin"

pg_isready -h 127.0.0.1 -p 5432
REMOTE
  ok "bootstrap 完成"
}

# ============ Install the production config compiler without activating services ============
phase_install_site_config_tool() {
  log "config: 构建并安装 /usr/local/sbin/aurocreator-config（不重启服务）"
  build_config_tool_local
  upload_release_artifacts "$BUILD_TMP/config-tool.tar.gz"

  ssh_exec_env REMOTE_DIR RELEASE_ID <<'REMOTE'
set -Eeuo pipefail
incoming="$REMOTE_DIR/incoming/$RELEASE_ID"
test -f "$incoming/config-tool.tar.gz"
TOOL_STAGED_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TOOL_STAGED_DIR"' EXIT
tar -xzf "$incoming/config-tool.tar.gz" -C "$TOOL_STAGED_DIR"
sudo install -o root -g root -m 0755 \
  "$TOOL_STAGED_DIR/config/aurocreator-config" \
  /usr/local/sbin/aurocreator-config
/usr/local/sbin/aurocreator-config --version
REMOTE
  ok "aurocreator-config 已安装；业务服务未重启"
}

# ============ 安全加固（不属于普通发布） ============
phase_harden() {
  log "harden: 配置 nginx 反向代理 + Let's Encrypt，应用仅监听 127.0.0.1:${PORT_BACKEND}/${PORT_NEXT}，公网仅留 SSH/80/443"
  ssh_exec_env REMOTE_DIR PORT_BACKEND PORT_DB PORT_NEXT ITEAMIFY_APP_URL <<'REMOTE'
set -Eeuo pipefail
DOMAIN="$(printf '%s\n' "$ITEAMIFY_APP_URL" | sed -E 's#^https?://([^/:]+).*#\1#')"
[ -n "$DOMAIN" ] || { echo "无法从 ITEAMIFY_APP_URL 解析域名: $ITEAMIFY_APP_URL" >&2; exit 1; }
SERVER_NAMES="$DOMAIN"
WWW_DOMAIN=""
CERTBOT_DOMAINS=(-d "$DOMAIN")
if [ "$DOMAIN" = "aurocreator.com" ]; then
  WWW_DOMAIN="www.$DOMAIN"
  SERVER_NAMES="$DOMAIN $WWW_DOMAIN"
  CERTBOT_DOMAINS+=(-d "$WWW_DOMAIN")
fi

test "$(curl --fail --silent http://127.0.0.1:"$PORT_BACKEND"/readyz | wc -c)" -gt 0
curl --fail --silent --show-error --output /dev/null http://127.0.0.1:"$PORT_NEXT"
grep -Fxq 'SERVER_HOST=127.0.0.1' <(sudo cat /etc/aurocreator/backend.env)

# nginx 已在目标主机运行；管理 aurocreator 主站和拒绝未知 Host 的默认边界，
# 不修改其他已命名站点。
NGINX_SITE=/etc/nginx/sites-available/aurocreator.conf
NGINX_DEFAULT_SITE=/etc/nginx/sites-available/000-default-deny.conf
ACME_ROOT=/var/www/aurocreator-acme
sudo install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled "$ACME_ROOT"

# 首次签发前只能引用 HTTP 配置。先让 ACME challenge 可达，再获取证书；
# 证书存在后才写入最终 HTTPS server block，避免 nginx -t 因缺证书失败。
sudo tee "$NGINX_SITE" >/dev/null <<NGINX
# >>> aurocreator >>>
server {
    listen 80;
    server_name $SERVER_NAMES;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_ROOT;
        default_type text/plain;
    }

    # Mobile artifacts are independent of the web/backend release directories.
    location ^~ /downloads/mobile/ {
        alias /opt/aurocreator/downloads/mobile/;
        autoindex off;
        types { application/vnd.android.package-archive apk; text/plain sha256; }
        default_type application/octet-stream;
        add_header Content-Disposition attachment;
        add_header X-Content-Type-Options nosniff;
    }

    location = /api/daemon/ws {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT_NEXT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
# <<< aurocreator <<<
NGINX
sudo tee "$NGINX_DEFAULT_SITE" >/dev/null <<'NGINX'
# Reject unknown Host headers instead of routing them to whichever site happens
# to be loaded first. This keeps product subdomains isolated from one another.
server {
    listen 80 default_server;
    server_name _;
    return 444;
}
NGINX
sudo ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/aurocreator.conf
sudo ln -sfn "$NGINX_DEFAULT_SITE" /etc/nginx/sites-enabled/000-default-deny.conf
if [ -d "$REMOTE_DIR/web-assets/releases" ]; then
  sudo python3 "$REMOTE_DIR/build/deploy/web-release.py" nginx "$REMOTE_DIR/web-assets" "$NGINX_SITE" --validate
fi
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

# Oracle Ubuntu images can ship direct INPUT rules that reject every port
# except SSH before packets ever reach UFW's chains. Configure UFW first, then
# insert narrowly scoped 80/443 accepts immediately before the first direct
# REJECT and persist the resulting ruleset for reboot safety.
SSH_SERVER_PORT="$(awk '{print $4}' <<<"${SSH_CONNECTION:-0 0 0 22}")"
sudo ufw allow "$SSH_SERVER_PORT/tcp" >/dev/null
sudo ufw allow 80/tcp >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw allow 443/udp >/dev/null
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
sudo ufw --force enable >/dev/null

ensure_input_accept_before_reject() {
  local protocol="$1"
  local port="$2"
  local reject_line=""
  if sudo iptables -C INPUT -p "$protocol" --dport "$port" -j ACCEPT 2>/dev/null; then
    return 0
  fi
  reject_line="$(sudo iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')"
  if [ -n "$reject_line" ]; then
    sudo iptables -I INPUT "$reject_line" -p "$protocol" --dport "$port" -j ACCEPT
  else
    sudo iptables -A INPUT -p "$protocol" --dport "$port" -j ACCEPT
  fi
}

ensure_input_accept_before_reject tcp 80
ensure_input_accept_before_reject tcp 443
ensure_input_accept_before_reject udp 443
if sudo test -d /etc/iptables; then
  sudo iptables-save | sudo tee /etc/iptables/rules.v4 >/dev/null
fi

CERTIFICATE_READY=1
if ! sudo test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem; then
  CERTIFICATE_READY=0
else
  for certificate_name in $SERVER_NAMES; do
    if ! sudo openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -noout -checkhost "$certificate_name" >/dev/null; then
      CERTIFICATE_READY=0
      break
    fi
  done
fi

if [ "$CERTIFICATE_READY" -ne 1 ]; then
  sudo apt-get install -y -qq certbot 2>/dev/null || true
  CERTBOT_ARGS=(
    certonly --webroot -w "$ACME_ROOT" --cert-name "$DOMAIN"
    "${CERTBOT_DOMAINS[@]}"
    --non-interactive --agree-tos --register-unsafely-without-email
  )
  if sudo test -e /etc/letsencrypt/live/$DOMAIN/fullchain.pem; then
    CERTBOT_ARGS+=(--expand)
  fi
  sudo certbot "${CERTBOT_ARGS[@]}" || {
      echo "Let's Encrypt 签发失败。请确认 Oracle VCN/NSG 已放行 80/443，且 DNS/Cloudflare 回源已指向本机。" >&2
      exit 1
    }
else
  sudo certbot renew --dry-run >/dev/null 2>&1 || true
fi
sudo test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem
sudo test -s /etc/letsencrypt/live/$DOMAIN/privkey.pem

sudo tee "$NGINX_SITE" >/dev/null <<NGINX
# >>> aurocreator >>>
server {
    listen 80;
    server_name $SERVER_NAMES;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_ROOT;
        default_type text/plain;
    }

    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name $SERVER_NAMES;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

    location / {
        proxy_pass http://127.0.0.1:$PORT_NEXT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Mobile artifacts are independent of the web/backend release directories.
    location ^~ /downloads/mobile/ {
        alias /opt/aurocreator/downloads/mobile/;
        autoindex off;
        types { application/vnd.android.package-archive apk; text/plain sha256; }
        default_type application/octet-stream;
        add_header Content-Disposition attachment;
        add_header X-Content-Type-Options nosniff;
    }

    location = /api/daemon/ws {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }
}
# <<< aurocreator <<<
NGINX
if [ -d "$REMOTE_DIR/web-assets/releases" ]; then
  sudo python3 "$REMOTE_DIR/build/deploy/web-release.py" nginx "$REMOTE_DIR/web-assets" "$NGINX_SITE" --validate
fi
sudo tee "$NGINX_DEFAULT_SITE" >/dev/null <<NGINX
# Explicitly reject unknown hosts. Without this block, nginx assigns the first
# loaded TLS site as the implicit default and can leak traffic across subdomains.
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

server {
    listen 443 ssl http2 default_server;
    server_name _;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    return 444;
}
NGINX
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

sudo systemctl is-active postgresql aurocreator-backend aurocreator-web nginx
wait_for_http_200() {
  local host="$1" path="$2" status="" attempt
  for attempt in $(seq 1 15); do
    status="$(curl --noproxy '*' --silent --show-error --output /dev/null \
      --write-out '%{http_code}' --resolve "$host:443:127.0.0.1" \
      "https://$host$path")"
    if [ "$status" = 200 ]; then
      return 0
    fi
    sleep 1
  done
  echo "$host$path 未在 reload 后收敛到 HTTP 200，最后状态：$status" >&2
  return 1
}

wait_for_http_200 "$DOMAIN" /healthz
wait_for_http_200 "$DOMAIN" /
if [ -n "$WWW_DOMAIN" ]; then
  wait_for_http_200 "$WWW_DOMAIN" /
fi
sudo ss -tlnp | grep -E ":(5432|$PORT_BACKEND|$PORT_NEXT)([[:space:]]|$)" || true
sudo ufw status verbose
REMOTE
  ok "安全加固完成"
}

# ============ Storage cleanup outside active immutable releases ============
phase_prune() {
  log "prune: 清理旧 live 构建、收窄依赖并分别保留各组件最近 $RELEASE_KEEP 个 release"
  acquire_deploy_lock
  ssh_exec_env REMOTE_DIR RELEASE_KEEP WEB_ASSET_KEEP WEB_ASSET_DAYS PNPM_VERSION TURBO_CACHE_KEEP NEXT_CACHE_MAX_MB INSTALL_SCOPE_VERSION <<'REMOTE'
set -Eeuo pipefail

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
    [ -x "$release/bin/aurocreator-backend" ] &&
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
if pgrep -af 'next build|turbo.*build|pnpm.*install' >/tmp/iteamify-prune-processes; then
  echo "检测到构建进程，拒绝清理：" >&2
  cat /tmp/iteamify-prune-processes >&2
  exit 1
fi

BEFORE_KB="$(df -Pk "$REMOTE_DIR" | awk 'NR==2 {print $4}')"

# 旧脚本曾直接在 /opt/aurocreator 根目录安装和构建；systemd 已不引用这些产物。
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
  echo "WARNING: Next cache ${NEXT_CACHE_MB}MB 超过预算 ${NEXT_CACHE_MAX_MB}MB；保留编译缓存，请根据各构建器用量安排清理"
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
      [ -x "$release/bin/aurocreator-backend" ] &&
        [ -x "$release/bin/aurocreator-migrate" ] &&
        [ -d "$release/server/migrations" ] || return 1
      if grep -Fxq 'site_config_compiler=1' "$release/manifest"; then
        [ -x "$release/bin/aurocreator-config" ] || return 1
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

WEB_HELPER="$REMOTE_DIR/build/deploy/web-release.py"
WEB_ASSETS="$REMOTE_DIR/web-assets"
if [ -f "$WEB_HELPER" ]; then
  for candidate in "$REMOTE_DIR/web-releases"/* "$(readlink -f "$REMOTE_DIR/web-current")"; do
    [ -d "$candidate/apps/web/.next/static" ] || continue
    python3 "$WEB_HELPER" publish "$WEB_ASSETS" "$candidate"
  done
fi

prune_component_releases server
prune_component_releases web
prune_component_releases daemon

if [ -d "$WEB_ASSETS/releases" ]; then
  # The retained asset archive is keyed by the artifact identity declared in
  # the running release manifest, not by its release directory name.
  WEB_TARGET="$(readlink -f "$REMOTE_DIR/web-current")"
  WEB_IDENTITY="$(awk -F= '$1 == "deployment_id" {print $2; exit}' "$WEB_TARGET/manifest" 2>/dev/null || true)"
  WEB_IDENTITY="${WEB_IDENTITY:-$(basename "$WEB_TARGET")}"
  python3 "$WEB_HELPER" prune "$WEB_ASSETS" "$WEB_IDENTITY" \
    --keep "$WEB_ASSET_KEEP" --days "$WEB_ASSET_DAYS"
  if sudo test -f /etc/nginx/sites-available/aurocreator.conf; then
    sudo python3 "$WEB_HELPER" nginx "$WEB_ASSETS" /etc/nginx/sites-available/aurocreator.conf --validate
    sudo systemctl reload nginx
  fi
fi

AFTER_KB="$(df -Pk "$REMOTE_DIR" | awk 'NR==2 {print $4}')"
echo "reclaimed_mb=$(((AFTER_KB - BEFORE_KB) / 1024))"
du -xhd1 "$REMOTE_DIR" 2>/dev/null | sort -h
REMOTE
  release_deploy_lock
  ok "prune 完成"
}

phase_unlock() {
  log "unlock: 检查服务器是否存在部署/构建进程"
  ssh_exec_env DEPLOY_LOCK_DIR <<'REMOTE'
set -Eeuo pipefail
if ! sudo test -d "$DEPLOY_LOCK_DIR"; then
  echo "没有部署锁"
  exit 0
fi
OWNER="$(sudo cat "$DEPLOY_LOCK_DIR/owner" 2>/dev/null || true)"
if [[ "$OWNER" =~ ^[A-Za-z0-9_-]+$ ]]; then
  case "$(sudo systemctl show "aurocreator-web-deploy-$OWNER.service" -p ActiveState --value 2>/dev/null || true)" in
    active|activating|deactivating|reloading)
      echo "Web 发布任务仍在运行，拒绝解锁：$OWNER" >&2
      exit 1 ;;
  esac
fi
if pgrep -af 'next build|turbo.*build|pnpm.*install' >/tmp/iteamify-deploy-processes; then
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
