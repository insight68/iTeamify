> 历史分析：独立 Prospector 已删除，其中关于 Python 获客服务的启动建议已失效。

# iTeamify 默认运行时 — 全流程分析与优化方案

> 分析范围：从 `make dev` 一键启动到 Agent 任务执行的完整运行时链路。
> 严重度：**P0** 阻断/数据风险 · **P1** 稳定性/正确性 · **P2** 体验/可维护性

---

## 一、运行时全景（5 层）

```
make dev ──► dev.sh
              │
              ├─ ① 开发运行时   前置检查 → .env → pnpm install → ensure-postgres → migrate
              │
              ├─ ② 服务器运行时  cmd/server/main.go (Go/Chi + pgxpool + Redis + WS)
              │      └─ 后台 worker: sweeper / heartbeat / autopilot / scheduler / channel / webhook
              │
              ├─ ③ Daemon 运行时  internal/daemon (poll → claim → prepare → exec agent CLI → report)
              │      └─ 16+ agent backend: claude/codex/copilot/cursor/grok/qwen...
              │
              ├─ ④ 迁移运行时    cmd/migrate (advisory lock + 562 个迁移文件 + pre-hook)
              │
              └─ ⑤ 自托管运行时  docker-compose (postgres + backend + web)
```

另发现：`services/prospector/`（Python 微服务，Phase 1）已被 `scripts/local-env.sh` 引用（`PROSPECTOR_GO_API_BASE`），但 **`dev.sh` 未启动它** —— 默认运行时存在缺口（详见 P1-6）。

---

## 二、各层问题与优化方案

### ① 开发运行时（dev.sh / Makefile）

| # | 严重度 | 问题 | 方案 |
|---|--------|------|------|
| D-1 | **P1** | `make stop` 用 `kill -9` 强杀 backend/frontend，绕过 Go server 的优雅关闭（main.go 有完整 shutdown 编排却用不上）→ in-flight 请求被截断、daemon 心跳残留 | 改为先发 `SIGTERM` 等 10s，超时再 `SIGKILL`；`lsof -ti:PORT` → `kill -TERM`，grace 后再 `-9` |
| D-2 | **P1** | 前置检查只验证 `node/pnpm/go/docker` **存在**，不验证**版本**。文档要求 Node 22 / Go 1.26.1 / pgvector:pg17，版本不符在运行时才报错，新人排查成本高 | dev.sh 加版本断言：`node -v` 前缀匹配、`go version` 解析、`docker compose images` 校验 pgvector tag |
| D-3 | **P2** | `make start` 与 `make dev` 都跑 `migrate up`，dev.sh 内部又跑一次（第 56 行）→ 重复迁移（虽 advisory lock 幂等，但每次冷启动多一次 DB 往返 + 编译 `go run`） | dev.sh 信任已迁移状态：加 `--skip-migrate` 快速路径，或用 stamp 文件 `.dev/migrated` 记录 schema 版本 |
| D-4 | **P2** | `.env.example` 默认 `JWT_SECRET=change-me-in-production`，dev.sh 直接 `cp` 不替换 → 本地签发的 token 用弱密钥，若本地端口暴露有风险 | dev.sh 复制后检测到占位值则 `openssl rand -hex 32` 自动替换（仿 selfhost target 已有的逻辑） |
| D-5 | **P1** | `services/prospector` Python 微服务已被 local-env.sh 引用，但 dev.sh 未启动 → 该服务在默认运行时中"配置了但没跑"，依赖它的功能会静默失败 | dev.sh 增加 prospector 启动分支（检测 `services/prosceptor` 存在 + Python 可用 → venv 启动），或明确标注为可选并从 local-env.sh 移除 |
| D-6 | **P2** | `trap 'kill 0' EXIT` 任一子进程崩溃即整体退出，无重启；前端崩了 backend 也跟着死 | 引入轻量进程管理：至少对 frontend 崩溃做一次自动重启，或提示用户用 `make start` 分离启动 |

### ② 服务器运行时（cmd/server/main.go）

| # | 严重度 | 问题 | 方案 |
|---|--------|------|------|
| S-1 | **P0** | 第 498-501 行：`srv.ListenAndServe()` 失败时直接 `os.Exit(1)`，**跳过所有 defer**（pool.Close / relay.Stop / relay.Wait / redis close）→ DB 连接泄漏、Redis relay 不优雅退出、未上报的 in-flight 事件丢失 | 改为 `slog.Error` + 通过 cancel 触发主流程 shutdown，让 defer 链正常执行；或把 ListenAndServe 放到带 recover 的 goroutine 里，错误通过 channel 传回主循环 |
| S-2 | **P0** | `JWT_SECRET` 为空只 `slog.Warn` 不阻断（第 179 行）。生产环境若忘配，会用 insecure default 启动并签发真实 token | `APP_ENV=production` 时强制校验：JWT_SECRET 为空或等于 `change-me-*` → `os.Exit(1)`。非 production 保留 warn |
| S-3 | **P1** | `pool.Ping(ctx)` 用 `context.Background()`（第 230 行）**无超时**，DB 不可达时启动永久卡死，k8s readiness probe 永不失败 → 滚动更新卡死 | `pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)` |
| S-4 | **P1** | Redis 配置失败时 `slog.Error` 后 fallback 到 in-memory hub（第 274 行），**多节点部署静默退化为单节点**，事件跨节点不投递，难以察觉 | 多节点场景（检测到 `REDIS_URL` 但解析失败）应 fail-fast；或启动后持续重试并在 metrics 暴露 `redis_degraded` 告警指标 |
| S-5 | **P1** | 7+ 个后台 goroutine 共用 `sweepCtx`，关闭顺序靠 main.go 手工编排注释维护（第 513-568 行）。当前正确但脆弱：新增 worker 容易插错顺序 | 抽象 `BackgroundWorker` 接口（`Run(ctx)` + `Shutdown(timeout)`），用注册表按依赖序自动编排启停；至少加启动/停止顺序的断言测试 |
| S-6 | **P2** | 配置散落 `os.Getenv`（main.go + dbstats.go + 多个 envXxx helper），无集中校验；APP_ENV=production 的安全校验分散在多处 | 引入 `config` 包集中加载+校验，启动时一次性 fail-fast；保留 envXxx 作为底层解析器 |
| S-7 | **P2** | metrics 默认关闭（`METRICS_ADDR` 空），dev 环境无可观测性；business metrics 需手动开启 | dev 模式默认启用 loopback metrics（`127.0.0.1:9090`），生产保持显式开启 |

### ③ Daemon 运行时（internal/daemon）

| # | 严重度 | 问题 | 方案 |
|---|--------|------|------|
| M-1 | **P1** | **文档与代码不一致**：`CLI_AND_DAEMON.md` 写 poll 默认 `3s`，`.env.example` 也设 `3s`，但 `config.go:22` 的 `DefaultPollInterval = 30s`。用户不加载 .env（如 systemd 部署）时实际是 30s，与文档预期差 10 倍 | 统一：把代码常量改为 `3 * time.Second` 对齐文档，或更新文档为 30s。建议前者（3s 更符合交互体验） |
| M-2 | **P1** | `deregisterRuntimes`（第 1123 行）只用 `5s` 超时 + `context.Background()`，daemon 崩溃/强杀时跳过 deregister → runtime 在 server 侧残留 online 直到 sweeper 150s 超时，期间任务仍被 dispatch 到死 runtime | server 侧 sweeper 已有兜底，但应缩短 stale 阈值（150s→60s）+ daemon 侧加信号处理确保正常退出必走 deregister；崩溃路径靠 sweeper |
| M-3 | **P1** | `pollLoop` 关闭等 in-flight task 最多 30s（第 3098 行），超时放弃。长任务（AgentTimeout 默认 0 无上限）在 shutdown 时被强杀，**终态上报可能丢失** → task 永远卡在 running | 30s 窗口与 AgentTimeout=0 矛盾。方案：shutdown 时对在途任务发 cancel + 走 detached terminal report（代码已有 `terminalTaskReportTimeout=6min` 机制，需确保强杀路径也触发它） |
| M-4 | **P1** | `AgentTimeout` 默认 0（无上限），仅靠 `DefaultAgentIdleWatchdog = 30min` 兜底。一个静默挂死的 agent 占用 slot 30 分钟，`MaxConcurrentTasks=20` 时最坏全部占满 | 给 AgentTimeout 设合理默认上限（如 2h），idle watchdog 作为补充；或在 config 层要求 `AgentTimeout==0` 时必须 watchdog>0 |
| M-5 | **P2** | `MaxConcurrentTasks` 默认 20 是硬编码，不随机器资源变化。4 核机器跑 20 个 agent CLI 会 CPU 争抢 | 基于 `runtime.NumCPU()` 设默认（如 `min(20, NumCPU*2)`），或加基于负载的自适应 |
| M-6 | **P2** | GC 三种模式（full/orphan/artifact）配置项多（TTL × pattern × interval），运行状态不可见 —— 用户不知道 GC 清了什么 | daemon status / health 暴露 GC 统计（上次扫描时间、清理字节数、清理目录数） |

### ④ 迁移运行时（cmd/migrate）

| # | 严重度 | 问题 | 方案 |
|---|--------|------|------|
| G-1 | **P1** | 迁移不在事务内（为支持 `CREATE INDEX CONCURRENTLY`），单条迁移含多条 SQL 时中途失败 → 部分已执行，`schema_migrations` 未记录 → 重跑可能报 "already exists" | 规范：CONCURRENTLY 索引单独成文件（CLAUDE.md 已有此规则，需 lint 强制）；非 CONCURRENTLY 迁移用 `BEGIN/COMMIT` 包裹。加迁移 lint 脚本 |
| G-2 | **P2** | 562 个迁移文件平铺在 `server/migrations/`，无目录分层，查找/审阅困难 | 按里程碑分目录（`migrations/000-0xx-init/`、`migrations/100-1xx-rt/`...），迁移加载器支持递归 |
| G-3 | **P2** | `migrate down` 无确认机制，误操作可回滚生产 schema | 交互式确认（非 `--force` 时提示），或限制 down 只在非 production |

### ⑤ 自托管运行时（Docker Compose）

| # | 严重度 | 问题 | 方案 |
|---|--------|------|------|
| H-1 | **P2** | `docker-compose.yml` 仅 postgres；自托管用 `docker-compose.selfhost.yml`（未读取内容但结构已知）。本地 dev 与自托管配置分裂，环境漂移 | 统一 base compose + override 模式，dev/selfhost 共享 postgres 定义 |
| H-2 | **P2** | selfhost 首次拉镜像失败时提示 `make selfhost-build`，但无自动 fallback | 检测拉取失败 → 自动询问是否 build，或直接 fallback |

---

## 三、横切问题（跨层）

### X-1 配置无单一 source of truth（P1）
配置散落在 5 处：`.env.example` / `Makefile` 变量 / `config.go` 常量 / CLI flag 默认 / `turbo.json` globalEnv。同一参数（如 poll interval、port）多处定义且已出现不一致（M-1）。

**方案**：建立 `docs/runtime-config.md` 作为配置权威表，列出每个参数的：环境变量 / flag / 代码默认 / 生效层 / 文档位置。CI 加脚本校验"代码常量 == 文档表"。

### X-2 dev 环境可观测性空白（P2）
metrics 默认关闭、无开箱日志聚合、daemon 日志只在本地文件。新人 `make dev` 后出问题只能看终端。

**方案**：dev 模式默认开 loopback metrics + 提供 `make logs` 一键聚合 backend/frontend/daemon 日志。

### X-3 运行时版本契约缺失（P2）
CI 固定 Node 22 / Go 1.26.1 / pgvector:pg17，但本地 dev 不校验。turbo.json 已把 `ci.yml` 列入 `globalDependencies`（防缓存毒化），但本地无对应保护。

**方案**：加 `.tool-versions`（asdf/rtx）或 `.nvmrc` + `go.mod` 已有 go 版本，dev.sh 主动校验。

---

## 四、优化路线图（按优先级）

### 第一阶段：阻断性修复（P0）
1. **S-1**：`ListenAndServe` 失败走优雅退出而非 `os.Exit`
2. **S-2**：生产环境强制校验 `JWT_SECRET`

### 第二阶段：稳定性（P1）
3. **S-3**：DB ping 加超时
4. **D-1**：`make stop` 改优雅关闭
5. **M-1**：统一 poll interval 默认值（代码对齐文档 3s）
6. **M-4**：AgentTimeout 设默认上限
7. **D-2**：dev.sh 版本校验
8. **D-5**：prospector 服务接入 dev.sh 或从 local-env.sh 移除
9. **M-3**：shutdown 时长任务终态上报保障
10. **G-1**：迁移 lint（CONCURRENTLY 单文件 + 非 CONCURRENTLY 包事务）
11. **X-1**：建立配置权威表 + CI 校验
12. **S-4**：Redis 失败多节点 fail-fast
13. **S-5**：后台 worker 生命周期抽象
14. **M-2**：缩短 stale runtime sweeper 阈值

### 第三阶段：体验与可维护性（P2）
15. **D-4**：dev.sh 自动替换弱 JWT_SECRET
16. **M-5/M-6**：并发数自适应 + GC 可观测
17. **S-7**：dev 默认开 metrics
18. **G-2/G-3**：迁移目录分层 + down 确认
19. **X-2/X-3**：dev 可观测性 + 版本契约

---

## 五、立即可做的 3 件事

1. **修 S-1**（10 行改动）：把 `os.Exit(1)` 改为 cancel 触发 shutdown，避免连接泄漏。
2. **修 M-1**（1 行改动）：`DefaultPollInterval = 3 * time.Second`，消除文档与代码的 10 倍差异。
3. **修 D-1**（Makefile stop target）：`kill -TERM` → wait → `kill -9`，让 Go server 优雅关闭生效。

这三项改动小、风险低、收益明确，建议优先合入。
