# 部署命令速查表

> 在项目根目录执行本地命令。正式生产是 `52tuan.com` 的 Ubuntu/systemd 部署；Docker Compose 仅用于自托管，Helm 仅用于 Kubernetes。
>
> 生产机密只保存在服务器 `/etc/iteamify/*.env`，不要复制到仓库或部署命令中。

## 1. 正式生产发布（推荐入口）

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 完整发布 | `./scripts/deploy.sh deploy` | 按 server → web → daemon 顺序发布，逐组件验证和回滚 |
| 完整发布别名 | `./scripts/deploy.sh all` | 等同 `deploy`，新操作统一使用 `deploy` |
| 只发布后端 | `./scripts/deploy.sh server` | 构建后端、执行迁移、切换 release、重启 backend 和售前 runtime |
| 只发布 Web | `./scripts/deploy.sh web` | 构建 Next.js、冒烟验证、切换 release、重启 Web |
| 只发布 daemon | `./scripts/deploy.sh daemon` | 检查活动任务后发布 CLI/daemon，避免中断正在运行的任务 |
| 只安装配置编译器 | `./scripts/deploy.sh config` | 同步并安装生产配置工具，不激活业务服务 |
| 发布前检查 | `./scripts/deploy.sh preflight` | 只读检查本地和远端依赖、连接及部署条件 |
| 验证生产 | `./scripts/deploy.sh verify` | 只读检查服务、release 指针、健康接口和 daemon 注册状态 |
| 初始化基础设施 | `./scripts/deploy.sh bootstrap` | 首次安装 PostgreSQL 等生产基础设施；不要日常重复执行 |
| 生产加固 | `./scripts/deploy.sh harden` | 配置 PostgreSQL、Caddy 和防火墙加固 |
| 清理旧产物 | `./scripts/deploy.sh prune` | 清理旧 release 和构建缓存，保留当前版本及回滚版本 |
| 清理陈旧部署锁 | `./scripts/deploy.sh unlock` | 仅确认没有构建/部署进程后使用 |

默认生产目标由 `scripts/deploy.sh` 管理：

| 配置 | 默认值 |
| --- | --- |
| SSH | `ubuntu@106.54.235.89` |
| SSH Key | `/Users/chunjun/.ssh/tecent_key` |
| 远端目录 | `/opt/iteamify` |
| 正式站点 | `https://52tuan.com` |

如需临时覆盖目标，使用环境变量：

```bash
SSH_HOST=ubuntu@HOST SSH_KEY=/path/to/key ITEAMIFY_APP_URL=https://example.com ./scripts/deploy.sh verify
```

## 1.5 aurocreator 部署（sshmd / /opt/aurocreator）

> 独立实例，部署到 sshmd（`~/.ssh/config` 中的 `Host sshmd`），远端目录 `/opt/aurocreator`，nginx + certbot 反向代理。PostgreSQL 须已在 sshmd 安装，bootstrap 只建库。

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 完整发布 | `./scripts/deploy-aurocreator.sh deploy` | 按 server → web → daemon 顺序发布，逐组件验证和回滚 |
| 只发布后端 | `./scripts/deploy-aurocreator.sh server` | 构建后端、执行迁移、切换 release、重启 backend 和售前 runtime |
| 只发布 Web | `./scripts/deploy-aurocreator.sh web` | 构建 Next.js、冒烟验证、切换 release、重启 Web |
| 只发布 daemon | `./scripts/deploy-aurocreator.sh daemon` | 检查活动任务后发布 CLI/daemon |
| 只安装配置编译器 | `./scripts/deploy-aurocreator.sh config` | 同步并安装 aurocreator-config，不激活业务服务 |
| 发布前检查 | `./scripts/deploy-aurocreator.sh preflight` | 只读检查本地和远端依赖、连接及部署条件 |
| 验证生产 | `./scripts/deploy-aurocreator.sh verify` | 只读检查服务、release 指针、健康接口和 daemon 注册状态 |
| 初始化数据库 | `./scripts/deploy-aurocreator.sh bootstrap` | 在已安装的 PostgreSQL 上创建 aurocreator 库/用户/扩展与实例密钥 |
| 生产加固 | `./scripts/deploy-aurocreator.sh harden` | 配置 nginx 反向代理 + Let's Encrypt 并收紧防火墙 |
| 清理旧产物 | `./scripts/deploy-aurocreator.sh prune` | 清理旧 release 和构建缓存 |
| 清理陈旧部署锁 | `./scripts/deploy-aurocreator.sh unlock` | 仅确认没有构建/部署进程后使用 |

默认目标由 `scripts/deploy-aurocreator.sh` 管理：

| 配置 | 默认值 |
| --- | --- |
| SSH | `sshmd`（需在 `~/.ssh/config` 配置 `Host sshmd`） |
| SSH Key | 未设置（依赖 `~/.ssh/config`；可用 `SSH_KEY=` 覆盖） |
| 远端目录 | `/opt/aurocreator` |
| 后端端口 | `18080` |
| Web 端口 | `13000` |
| 反向代理 | `nginx + certbot`（Let's Encrypt） |
| 正式站点 | `https://aurocreator.com` |
| PostgreSQL | sshmd 已安装，bootstrap 仅建库/用户/扩展 |
| 服务用户 | `root`（`DEPLOY_USER`，主服务运行身份；可用 `DEPLOY_USER=`/`DEPLOY_HOME=` 覆盖为专用系统用户） |

如需临时覆盖目标，使用环境变量：

```bash
SSH_HOST=sshmd ITEAMIFY_APP_URL=https://aurocreator.com ./scripts/deploy-aurocreator.sh verify
```

## 2. 正式生产直接运维

| 目的 | 命令 |
| --- | --- |
| 登录服务器 | `ssh -i /Users/chunjun/.ssh/tecent_key ubuntu@106.54.235.89` |
| 修改后端环境变量 | `sudoedit /etc/iteamify/backend.env` |
| 重启后端 | `sudo systemctl restart iteamify-backend` |
| 重启 Web | `sudo systemctl restart iteamify-web` |
| 重启 daemon | `sudo systemctl restart iteamify-daemon` |
| 重新加载 Caddy | `sudo systemctl reload caddy` |
| unit 文件变化后重载 systemd | `sudo systemctl daemon-reload` |
| 查看核心服务状态 | `sudo systemctl status iteamify-backend iteamify-web iteamify-daemon --no-pager` |
| 检查全部生产服务 | `sudo systemctl is-active postgresql iteamify-backend iteamify-web iteamify-daemon caddy` |
| 查看后端日志 | `sudo journalctl -u iteamify-backend -n 200 --no-pager` |
| 实时查看后端日志 | `sudo journalctl -u iteamify-backend -f` |
| 查看 Web 日志 | `sudo journalctl -u iteamify-web -n 200 --no-pager` |
| 查看 daemon 日志 | `sudo journalctl -u iteamify-daemon -n 200 --no-pager` |
| 检查后端就绪 | `curl -fsS http://127.0.0.1:8080/readyz` |
| 检查 daemon 健康 | `curl -fsS http://127.0.0.1:19514/health` |
| 检查公网 | `curl -fsS https://52tuan.com/` |

从本机直接重启并验证后端：

```bash
ssh -i /Users/chunjun/.ssh/tecent_key ubuntu@106.54.235.89 \
  'sudo systemctl restart iteamify-backend && sudo systemctl is-active iteamify-backend && curl -fsS http://127.0.0.1:8080/readyz'
```

> 环境变量变化只需要重启对应服务，不需要重新发布。代码或数据库迁移变化必须使用 `./scripts/deploy.sh server`，不要仅执行 `systemctl restart`。

## 3. 自托管 Docker Compose

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 使用官方镜像启动 | `make selfhost` | 必要时生成 `.env`，拉取镜像并启动 |
| 从当前源码构建启动 | `make selfhost-build` | 使用本地源码构建 backend/web 镜像 |
| 停止自托管 | `make selfhost-stop` | 停止 Compose 服务，保留命名卷数据 |
| 拉取新镜像 | `docker compose -f docker-compose.selfhost.yml pull` | 只拉取，不重启 |
| 应用新镜像 | `docker compose -f docker-compose.selfhost.yml up -d` | 容器启动时自动执行迁移 |
| 只重建后端容器 | `docker compose -f docker-compose.selfhost.yml up -d --force-recreate backend` | 用于后端环境变量变化 |
| 查看服务状态 | `docker compose -f docker-compose.selfhost.yml ps` | 只读 |
| 查看全部日志 | `docker compose -f docker-compose.selfhost.yml logs -f` | 实时日志 |
| 查看后端日志 | `docker compose -f docker-compose.selfhost.yml logs -f backend` | 实时日志 |
| 停止并移除容器 | `docker compose -f docker-compose.selfhost.yml down` | 不加 `-v`，避免删除数据库卷 |
| 一键安装自托管 | `curl -fsSL https://raw.githubusercontent.com/iteamify-ai/iteamify/main/scripts/install.sh \| bash -s -- --with-server` | 安装 CLI 并启动 Docker 自托管 |
| 停止一键安装实例 | `curl -fsSL https://raw.githubusercontent.com/iteamify-ai/iteamify/main/scripts/install.sh \| bash -s -- --stop` | 停止默认安装目录中的服务 |

## 4. Kubernetes / Helm

以下示例使用 release `iteamify` 和 namespace `iteamify`。

| 目的 | 命令 |
| --- | --- |
| 创建 namespace | `kubectl create namespace iteamify` |
| 从环境文件创建 Secret | `kubectl -n iteamify create secret generic iteamify-secrets --from-env-file=/path/to/iteamify-secrets.env` |
| Helm lint 和配置测试 | `bash scripts/helm-config.test.sh` |
| 渲染清单 | `helm template iteamify deploy/helm/iteamify -n iteamify -f /path/to/values.production.yaml` |
| 首次安装/升级 | `helm upgrade --install iteamify deploy/helm/iteamify -n iteamify --create-namespace -f /path/to/values.production.yaml` |
| 查看发布状态 | `helm status iteamify -n iteamify` |
| 查看发布历史 | `helm history iteamify -n iteamify` |
| 查看资源状态 | `kubectl -n iteamify get pods,svc,ingress` |
| 查看事件 | `kubectl -n iteamify get events --sort-by=.lastTimestamp` |
| 回滚 Helm | `helm rollback iteamify REVISION -n iteamify` |
| 卸载 Helm | `helm uninstall iteamify -n iteamify` |

> `helm uninstall` 会删除 release 管理的资源；执行前确认数据库和持久卷保留策略。生产 Secret 不应写入 `values.production.yaml`。

## 5. 版本发布

生产 CLI 发布要求 tag 位于最新 `main`，推送 tag 后由 `.github/workflows/release.yml` 构建发布产物。

| 目的 | 命令 |
| --- | --- |
| 更新 main | `git switch main && git pull --ff-only` |
| 创建版本 tag | `git tag v0.x.x` |
| 推送版本 tag | `git push origin v0.x.x` |
| 查看 GitHub Actions | `gh run list --workflow release.yml --limit 10` |

## 6. 选择规则

| 场景 | 使用命令 |
| --- | --- |
| 52tuan 正式生产完整发布 | `./scripts/deploy.sh deploy` |
| 仅后端/Gmail/数据库迁移变化 | `./scripts/deploy.sh server` |
| 仅前端变化 | `./scripts/deploy.sh web` |
| 仅 agent daemon/CLI 变化 | `./scripts/deploy.sh daemon` |
| 仅服务器环境变量变化 | 修改 `/etc/iteamify/backend.env` 后 `sudo systemctl restart iteamify-backend` |
| 普通自托管用户 | `make selfhost` |
| Kubernetes 集群 | `helm upgrade --install ...` |

