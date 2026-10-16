# 混合模式落地方案：云端控制面 + 本机执行面

> 2026-10-12 · 基于当前工作区代码实测（非设计推测）
> 结论先行：**协议面已经建完，缺的是「执行位置」的一等公民地位**。这份方案 70% 的工作是"把已有协议用到两条路径上"，只有 30% 是新增。

---

## 0. 定调

不是"把 daemon 隔离出去"，而是明确**两条执行路径长期并存**：

| | 控制面（云端） | 执行面（本机） |
|---|---|---|
| 拥有 | 身份、成员、workspace、agent 定义、任务队列、调度、审计、计费、消息归档 | CLI 进程、文件系统、git 仓库、构建产物、CLI 登录态与订阅额度 |
| 生命周期 | 常驻、多实例、可水平扩展 | 用户机器，随时可能休眠/断网/关机 |
| 数据 | Postgres + Redis + 对象存储 | 本地磁盘（`ITEAMIFY_WORKSPACES_ROOT`） |

**这不是新架构 —— 这是本项目从第一版迁移就定下的原始设计**：

```sql
-- server/migrations/004_agent_runtime_loop.up.sql:6
runtime_mode TEXT NOT NULL CHECK (runtime_mode IN ('local', 'cloud'))
```

`local` / `cloud` 两个值从建表起就在。后续演进里 `local`（本机 daemon）走通了，`cloud` 没有形成完整实体。本方案的核心就是**把这条已经预留的通道补齐并固化**。

---

## 1. 现状盘点

### 1.1 已建成，可直接用（不要重写）

| 能力 | 位置 | 状态 |
|---|---|---|
| 控制面 REST | `cmd/server/router.go:1118` 起的 `/api/daemon` 组 | 完整，30+ 端点 |
| 控制面 WS | `/api/daemon/ws?runtime_ids=` · `internal/daemonws/hub.go` | 完整 |
| 注册 / 注销 / 心跳 | `handler/daemon.go:385` `DaemonRegister` / `:914` `Deregister` / `:1046` `Heartbeat` | 完整 |
| 任务认领 | `POST /api/daemon/tasks/claim`（批量）＋ WS RPC `tasks.claim` | 完整 |
| 执行期回传 | `start` / `progress` / `messages` / `usage` / `session` / `complete` / `fail` / `cancel-ack` | 完整 |
| 五路认证 | managed service token · `mdt_` daemon token · `mcn_` Cloud Node PAT · `mul_` 用户 PAT · JWT | 完整（`middleware/daemon_auth.go`） |
| **离线容忍** | `daemon/task_reports.go` 落盘重放 ＋ 终态重试 124s 调度（`client.go:855`） | 完整 |
| 失效回收 | stale 150s → offline（`runtime_sweeper.go:31`）；7 天离线 GC（`:34`，带 `NOT IN (SELECT runtime_id FROM agent)` 保护） | 完整 |
| 自愈 | `isRuntimeNotFoundError` → prune 本地 runtime ＋ re-register（`daemon.go:685`） | 完整 |
| 多实例投递 | Redis relay，scope `realtime.ScopeDaemonRuntime`（`daemonws/notifier.go:23`） | 完整 |
| 断线降级 | WS 优先 → HTTP fallback，含 double-claim 防护（`wsrpc.go:20-32`） | 完整 |

**这一栏是最大的好消息**：混合模式最难的部分（daemon 会掉线、会换 IP、会被关机、消息要幂等重放）**已经解决过了**。

### 1.2 数据模型已经是混合的

```sql
-- 004_agent_runtime_loop.up.sql
agent_runtime (
  runtime_mode CHECK IN ('local','cloud'),   -- L6  位置是显式字段
  daemon_id TEXT,                            -- L4  NULL = 无宿主（云端）
  UNIQUE (workspace_id, daemon_id, provider) -- L14
)
agent.runtime_id            NOT NULL REFERENCES agent_runtime   ON DELETE RESTRICT  -- L70-73
agent_task_queue.runtime_id NOT NULL REFERENCES agent_runtime   ON DELETE CASCADE   -- L83-86
CREATE INDEX idx_agent_task_queue_runtime_pending
  ON agent_task_queue(runtime_id, priority DESC, created_at ASC)
  WHERE status IN ('queued','dispatched');                                           -- L90-92
```

三个决定性事实：

1. **执行位置的选择粒度是 agent 级** —— `agent.runtime_id` 决定这个 agent 跑在哪。
2. **入队即定 runtime** —— task 从 agent 复制 `runtime_id`，claim 按 `(runtime_id, priority, created_at)` 扫描。派发是**查表**，不是运行时决策。
3. **`daemon_id` 可为 NULL** —— 天然表达"没有宿主机"，即云端 runtime。

### 1.3 缺口（真正要做的）

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| G1 | `runtime_mode='cloud'` **从未被写入过** | daemon 注册三处硬编码 `RuntimeMode:"local"`（`handler/daemon.go:528/613/659/776`）；managed 预置行也是 `local`（`deploy/systemd/README.md:187`） | 字段存在但无实体，混合模式只有一条腿 |
| G2 | 云端 executor 未接通 | `server/runtime/`（Open Agent SDK：agent/sandbox/tools/session/permissions/costtracker）在 daemon 协议里只有 1 处非测试引用（`handler/chat.go`） | 无法承载 cloud runtime |
| G3 | **没有 server→daemon 的取消推送** | daemon 靠轮询 `GET /tasks/{taskId}/status`（`daemon.go:3706` `watchTaskCancellation`） | 取消延迟一个轮询周期；长任务白白烧 token |
| G4 | WS 只承载 1 个 RPC | `handler/daemon_rpc.go:46` switch 里只有 `tasks.claim` | 控制通道带宽浪费 |
| G5 | 第三方云执行面协议分叉 | `public-sales-runtime` 走 `/api/internal/public-sales/*` ＋ 独立表 `public_sales_runtime_instance` | 第三套模型，与 `agent_runtime` 不统一 |
| G6 | 前端无执行位置选择 | runtime 创建页无类型选择 | 用户无法表达"这个 agent 跑云端" |
| G7 | Helm chart 未渲染 managed/public-sales 变量 | `deploy/helm/iteamify/templates/configmap.yaml` 只渲染 3 个变量 | 生产部署缺一片 |
| G8 | poll interval 文档与代码不一致 | `CLI_AND_DAEMON.md` 写 3s，`daemon/config.go:22` `DefaultPollInterval = 30s` | 误解与误配 |

---

## 2. 目标架构

```
┌──────────────────── 云端：控制面（必选） ────────────────────┐
│  Web (Next.js)  ·  Public API  ·  Scheduler / Autopilot       │
│  任务队列 (agent_task_queue)  ·  WS Hub  ·  Redis relay       │
│  Postgres  ·  对象存储  ·  审计  ·  计费  ·  消息归档         │
│                                                               │
│  ┌─ 可选：云端执行面 ─────────────────────────────┐          │
│  │  Cloud runtime (runtime_mode='cloud')          │          │
│  │  执行器 = server/runtime (Open Agent SDK)      │          │
│  │  daemon_id = NULL                              │          │
│  └───────────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
        ▲                                    ▲
        │ ①daemon 主动出站长连 (WS)          │ ②云端执行直接进程内
        │ ②REST 控制/回传（HTTP fallback）    │
        │                                    │
┌───────┴──────────── 用户本机：执行面 ──────┴────────────────────┐
│  iteamify daemon (runtime_mode='local')                          │
│   ├ CLI 探测：27 backend（claude/codex/cursor/grok/qwen/...）   │
│   ├ workspace 目录 / git clone / worktree / repocache          │
│   ├ spawn CLI 子进程 ＋ idle/tool watchdog                     │
│   ├ 消息流回传 ＋ 终态重试 ＋ 落盘重放                          │
│   ├ per-tenant session store（CLAUDE_CONFIG_DIR / CODEX_HOME） │
│   └ GC：2h 扫盘，full / orphan / artifact 三模式                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 职责边界（硬规则）

| 资源 | 云端 | 本机 | 说明 |
|---|---|---|---|
| 用户 / 成员 / workspace | ✅ 唯一权威 | ❌ | 本机只有只读快照（`GET /api/daemon/workspaces`，带 ETag） |
| agent 定义与 runtime 绑定 | ✅ 写 | ❌ | 本机只能注册 runtime，不能改 agent 归属 |
| 任务队列与派发 | ✅ 唯一权威 | ❌ | 本机只能 claim，不能自造任务 |
| CLI 进程与文件系统 | ❌ 永不接触 | ✅ 唯一权威 | 这是混合模式的分界线 |
| 消息 / usage / 产物 | ✅ 归档 | ✅ 产生并上传 | 本机是生产者，云端是账本 |
| 长时状态（repo、构建产物） | ❌ 不缓存 | ✅ | ⚠️ 见 D4：这意味着会话黏性 |
| 计费归属 | ✅ 记账 | — | CLI 走用户订阅；cloud runtime 走平台账单 |

**一句话边界**：云端不知道也不关心本机的文件；本机不知道也不关心其他 agent 的存在。

### 2.2 完整时序（本机执行路径）

```
daemon                                server(云端)
  │                                      │
  │ ① POST /api/daemon/register          │  上报 daemon_id + workspace + runtimes[]
  │ ────────────────────────────────────►│  upsert agent_runtime (mode=local)
  │ ◄────────────────────────────────────│  返回 repos + settings + repos_version
  │                                      │
  │ ② GET /api/daemon/ws?runtime_ids=... │  建立常驻出站长连
  │ ════════════════════════════════════►│  入站：daemon:heartbeat / rpc_request
  │ ◄════════════════════════════════════│  出站：heartbeat_ack / task_available
  │                                      │
  │ ③ 心跳 15s（WS 优先，静默超窗自动回退 HTTP）
  │ ────────────────────────────────────►│  liveness TTL 90s；DB 刷写 60s 节流
  │                                      │
  │                                      │ ④ task 入队
  │ ◄──── daemon:task_available ─────────│    唤醒提示（仅提示，不派发）
  │                                      │
  │ ⑤ POST /tasks/claim（或 WS tasks.claim）  批量认领
  │ ────────────────────────────────────►│  ClaimTasksForRuntimes → 铸造 mat_ token
  │ ◄────────────────────────────────────│  返回 task 详情 + 任务级凭据
  │                                      │
  │ ⑥ POST /tasks/{id}/start             │
  │ ────────────────────────────────────►│
  │ ⑦ 建 workspace 目录 → spawn CLI 子进程
  │    · ITEAMIFY_TOKEN=mat_ 注入子进程
  │    · watchdog: idle 30m / tool / semantic
  │                                      │
  │ ⑧ POST /tasks/{id}/messages  (批量、落盘重放) │
  │ ────────────────────────────────────►│  写归档，广播前端
  │    POST /tasks/{id}/progress / usage / session │
  │ ────────────────────────────────────►│
  │                                      │
  │ ⑨ 终态 POST /complete 或 /fail（重试 124s 调度）
  │ ────────────────────────────────────►│
  │                                      │
  │ ⑩ 循环 ③⑤（轮询间隔 ITEAMIFY_DAEMON_POLL_INTERVAL）
  │                                      │
  │ ✗ 断网/休眠 → 写盘重放；重启后 replayTaskReports 补报
  │ ✗ runtime 被回收 → 404 "runtime not found" → prune + 重新 register
  │ ✗ 任务被取消 → 轮询 /tasks/{id}/status 发现 → 中断 agent → cancel-ack
```

---

## 3. 六个核心设计决策

### D1 · 执行位置的粒度 = agent 级（沿用现状，不要动）

**现状**：`agent.runtime_id NOT NULL`，选择粒度就是 agent。

**建议**：保持。不要引入"task 级"或"workspace 级"的位置选择。

**理由**：agent 是"这个助手是什么"的定义（prompt、skill、MCP、模型），执行位置是这个定义的一部分属性。让 task 级动态选 runtime 会直接破坏 session 黏性（同一会话在两台机器上跑 → `CLAUDE_CONFIG_DIR` 不同 → resume 失败）。

**影响面**：零改动。

---

### D2 · 一 workspace 多 runtime：显式绑定，永不 fallback

**现状**：`UNIQUE (workspace_id, daemon_id, provider)` 允许一 workspace 下多台机器、每个 provider 一行。

**建议**：参照 `docs/runtime-fallback-risk-analysis.md` 的方案 A —— **CLI runtime 与 Cloud runtime 并列，用户/管理员显式选择，不做自动 fallback**。

**理由**（该文档已论证，这里只摘要）：
- 两套执行模型的 provider 覆盖不同（CLI 27 个 vs SDK 2 个）
- session 机制不兼容（CLI 原生 session 目录 vs SDK JSONL）
- **没有安全的 fallback 点**：跑到一半失败时已有副作用（文件已改），fallback = 换个 agent 重来
- 费用归属会混乱（用户订阅 vs 平台账单）

**落地**：
- 前端 runtime 创建页加执行位置选择（G6）
- agent 详情页显示「执行位置」徽标 + 宿主机器名（`device_info` 字段已有）
- server 侧在 claim 前校验：agent 的 runtime 与 agent 声明的 provider 能力匹配

**验收断言**：一个 workspace 能同时存在 `mode=local`（3 台机器）与 `mode=cloud`（1 个）共 4 个 runtime，创建 agent 时下拉可选，且**不存在**任何"本地失败自动切云端"的代码路径。

---

### D3 · 凭据模型：三层，别混用

**现状**：五路认证都已实现（`middleware/daemon_auth.go`），但混用会造成权限过宽。

**建议的三层模型**：

| 层 | 凭据 | 作用域 | 用途 |
|---|---|---|---|
| ① 登录引导 | `mul_` 用户 PAT（或浏览器 OAuth） | 用户级 | **仅** `iteamify login` 一次性换取 ②，用完即弃 |
| ② daemon 长期凭据 | `mdt_` daemon token | workspace + daemon | daemon 常驻使用；`X-Daemon-ID` 绑定 |
| ③ 任务级凭据 | `mat_` task token | 单任务 | claim 时铸造，注入 agent 子进程作 `ITEAMIFY_TOKEN` |
| （平台托管） | managed service token | 全局 | 托管 daemon，需 `ITEAMIFY_MANAGED_DAEMON_ID` 匹配 |
| （第三方节点） | `mcn_` Cloud Node PAT | node + instance | 由 Cloud Fleet 校验，60s 缓存 |

**关键约束**：
- ② **不要**回退成 ①。PAT 是用户级、过期 90 天、权限覆盖全部 workspace —— 让它常驻在用户机器上是过度授权。`daemon_auth.go:228-265` 的 `mul_` 路径应当只作为登录引导期的过渡。
- ③ 必须注入**子进程环境**而不是 daemon 进程环境，且任务结束即失效。
- `mcn_` 的 60s 缓存 TTL **就是吊销延迟上界**（`auth/cloud_pat.go:37`）—— 不要把 TTL 调长。

**验收断言**：断开网络后重连，daemon 只用 `mdt_` 恢复，不需要用户重新登录；子进程 env 里只有 `mat_`，拿不到 `mdt_`/`mul_`。

---

### D4 · 离线语义：三档，且必须显式定义"任务归属"

这是混合模式**最容易被忽略、也最容易出事**的地方。

**现状已有**：
- 落盘重放：`daemon/task_reports.go:415` `replayTaskReports`
- 终态重试：`client.go:855` `defaultTerminalRetrySchedule`（5 档共 124s）
- 服务端 stale 判定：150s 无心跳 → offline（`runtime_sweeper.go:31`）
- 离线 GC：7 天（`runtime_sweeper.go:34`）
- 自愈：runtime 行消失 → 404 → prune + 重注册

**建议显式定义三档**：

| 档 | 触发 | 云端行为 | 本机行为 | 任务归属 |
|---|---|---|---|---|
| T1 短暂断连 | < 150s 无心跳 | 保持 online，**不回收任务** | WS 自动重连；消息进本地队列 | 仍属本机 |
| T2 长时间失联 | 150s ~ 任务超时 | 标 offline；**任务保留在队列**（`queued`/`dispatched` 不变） | 重连后 `replayTaskReports` 补报 | 仍属本机（等它回来） |
| T3 明确放弃 | 用户点"回收" 或 7 天 GC | 任务转 `failed` 并写明原因 | 下次启动发现 runtime 没了 → 重新注册 | 云端接管（或标记失败） |

**必须补的规则**（当前缺失）：
1. **T2 期间的"僵尸任务"要有可见性** —— 前端应显示"任务正在一台已离线 40 分钟的机器上运行"，而不是静默卡住。
2. **T3 回收必须是显式动作**，不能靠 GC 静默发生。GC 只应回收**没有任务挂着的** runtime（现有 SQL 已有 `NOT IN (SELECT runtime_id FROM agent)` 保护，但没保护 `agent_task_queue`）。
3. **绝不自动迁移任务到另一台机器**。理由同 D2：session 与文件系统黏性。宁可失败让人重试。

**验收断言**：
- 拔网线 200s 再插回，任务最终成功完成且消息完整（不重不漏）。
- 查询 `SELECT count(*) FROM agent_task_queue WHERE status IN ('queued','dispatched') AND runtime_id IN (SELECT id FROM agent_runtime WHERE status='offline')` —— 这个数字应该是可见的运维指标，不是隐藏状态。

---

### D5 · 控制推送：给 WS 加取消通道（当前唯一的实时性硬伤）

**现状**：`daemon.go:3706` `watchTaskCancellation` 轮询 `GET /api/daemon/tasks/{taskId}/status`。服务端取消后，本机最长要等一个轮询周期才发现。

**建议**：新增 WS 出站消息 `daemon:task_cancelled`。

**落地改点**（四处，都很小）：
1. `pkg/protocol/events.go` — 加 `EventDaemonTaskCancelled = "daemon:task_cancelled"`
2. `pkg/protocol/messages.go` — 加 payload（`task_id` + `reason`）
3. `internal/daemonws/hub.go` — 加 `NotifyTaskCancelled(runtimeID, taskID, reason)`
4. `internal/daemon/wakeup.go` — 入站分支调用 `shouldInterruptAgent`；**保留轮询作为兜底**（WS 不可用时行为不变）
5. `internal/service/task.go:1984` 取消路径 — 调 notifier

**注意**：这是**加速**而非**替代**。轮询必须保留 —— WS 只是快路径，daemon 掉线时的语义仍由轮询 + 状态查询定义。这与现有 `task_available` 的设计一致（WS 是提示，HTTP 是权威）。

**验收断言**：取消一个正在跑的长任务，本机在 2s 内（而非一个轮询周期）开始中断；且 WS 断开时行为与现在完全一致。

---

### D6 · 云端执行面：与 SDK cloud runtime 并列，不要复用 public-sales 那套

**现状**：存在两条互不统一的"云端执行"：
- `server/runtime/`（Open Agent SDK）：进程内 agent loop，`agent/sandbox/tools/session/permissions/costtracker` 齐全，但**未接入 daemon 协议**（G2）
- `cmd/public-sales-runtime`：独立 Go worker，走 `/api/internal/public-sales/*` 独立协议 + 独立表（G5）

**建议**：**新增 cloud runtime 走 `agent_runtime`（`runtime_mode='cloud'`，`daemon_id=NULL`）**，执行器用 `server/runtime`。public-sales 那套保持现状不动（它是单一业务场景的特化，不必强行抽象）。

**理由**：
- 复用同一张表、同一套 claim/回传，前端/计费/审计全部免费获得
- public-sales 的隔离设计（不持有 DB/Redis/FS）是**为安全特化的**，把它当通用执行面会丢掉它苦心建立的边界

**前置条件**（`runtime-fallback-risk-analysis.md` 已列，此处确认仍成立）：
1. `runtime/agent/` 写集成测试（当前测试覆盖薄）
2. `runtime/sandbox/` 安全审计（进程内 bash 工具）
3. `SDKMessage` → `TaskMessageData` 消息流适配
4. SDK session 与 `PinTaskSession` 对接
5. CI 跑 SDK e2e

**验收断言**：同一 workspace 下两种 runtime 的任务在 issue 详情页呈现一致的消息时间线，仅"执行位置"徽标不同。

---

## 4. 落地清单

### WS1 · 让 `runtime_mode` 真正可用（G1/G6）

| 改动 | 文件 | 说明 |
|---|---|---|
| 抽出 runtime_mode 常量 | 新 `internal/runtimekind/kind.go` | 消灭散落的字面量 `"local"` |
| daemon 注册显式传 mode | `handler/daemon.go:528/613/659/776` | 现为硬编码 `"local"`，改为按路径推导 |
| 前端 runtime 创建页加位置选择 | `packages/views/` runtime 设置页 | 需要 `NavigationAdapter`，不能引 next/* |
| agent 详情显示执行位置 + 宿主 | `packages/views/` agent 详情 | 用 `device_info` + `runtime_mode` |
| 列表接口返回 mode | `handler/runtime.go:32,109` | 字段已存在，确认前端消费 |

**验收**：`SELECT runtime_mode, count(*) FROM agent_runtime GROUP BY 1` 能同时出现 `local` 和 `cloud` 两行（云 runtime 需 WS4 完成后才有数据）。

---

### WS2 · 控制推送（G3/G4）

见 D5。额外：把 WS RPC 的 `switch method` 从单一 `tasks.claim` 扩展为可注册表，为后续控制指令（暂停/改 model/查状态）留位。

**验收**：取消延迟 < 2s；`daemonws` 单测覆盖"WS 断开 → 轮询兜底"路径。

---

### WS3 · 本机执行面的运维体验（G8）

| 改动 | 文件 | 说明 |
|---|---|---|
| 统一 poll interval 默认值 | `daemon/config.go:22` | 代码 `30s` vs 文档 `3s`，取 3s |
| `daemon status` 输出执行位置与宿主 | `internal/daemon/health.go` | 让用户知道自己这台机器在跑哪些 agent |
| 多机命名 | `ITEAMIFY_DAEMON_DEVICE_NAME`（已存在） | 强制在 UI 上可区分，避免"Local runtime"×3 |
| GC 可观测 | `daemon/health.go` | 暴露上次扫描时间/清理字节数 |

**验收**：`iteamify daemon status --output json` 含本机承载的 agent 列表与各 runtime 名。

---

### WS4 · 云端执行面接通（G2）— 第三阶段，可选

见 D6。工作量最大，且需要 SDK 生产就绪。

---

### WS5 · 部署与配置（G7）

| 组件 | 部署位置 | 关键配置 |
|---|---|---|
| Web + Public API | 云端（容器/VM，**不是 serverless**） | `ITEAMIFY_APP_URL`、`ITEAMIFY_PUBLIC_URL`、CORS |
| Postgres | 云端 | `DATABASE_URL`，pgvector ≥ pg17 |
| Redis | 云端 | relay + liveness + cache，多实例必需 |
| 对象存储 | 云端 | 已有 `local.go` / `s3.go` 双实现 |
| 反向代理 | 云端 | 仅暴露 Web + public API；`/api/internal/*` 必须封锁 |
| daemon | **用户本机** | `ITEAMIFY_SERVER_URL` + `mdt_` |
| cloud runtime（可选） | 云端容器 | 独占 `runtime_mode='cloud'` 行 |

**补 Helm**：`deploy/helm/iteamify/templates/configmap.yaml` 目前只渲染 3 个变量，需要补齐 managed / public-sales / relay 相关（G7）。

**验收**：`docker compose -f docker-compose.selfhost.yml up` 后，`iteamify setup self-host` 能在一台干净机器上完成 register → heartbeat → claim 全链路。

---

### WS6 · 安全清单

必须保持的边界（大部分已实现，需回归验证）：

1. **daemon 必须主动出站**。云端永不反向连接用户机器。这既是 NAT 穿透的需要，也是安全前提。
2. **`/api/internal/public-sales/*` 与内部端点必须在反代层封锁**（`deploy/systemd/README.md:347-375` 已有规则）。
3. **任务级凭据注入子进程**，daemon 自身凭据不泄漏给 agent（`mat_` 设计已如此）。
4. **per-tenant session 隔离**：`CLAUDE_CONFIG_DIR` / `CODEX_HOME` 必须每 workspace 独立 —— `gc.go:76-82` 会把 `WorkspacesRoot` 下的非 `.repos` 目录当 orphan 删除，所以 session store 根目录**绝不能**放在 `WorkspacesRoot` 内（这条是既有踩坑）。
5. **`JWT_SECRET` 生产强制校验**（`runtime-analysis.md` S-2，当前只 warn 不阻断）。
6. **`mcn_` 缓存 TTL 不放大**（60s 即吊销上界）。
7. **本机执行意味着"用户的代码在用户的机器上"** —— 这是混合模式的安全优势，产品材料里应当明说。

---

## 5. 分阶段路线

### 阶段一：把混合模式变成显式能力（1~2 周）
1. WS1：`runtime_mode` 一等公民 + 前端位置选择
2. WS3：poll interval 统一 + `daemon status` 暴露归属
3. WS6-5：`JWT_SECRET` 生产强制校验

**产出**：用户能在界面上明确看到"这个 agent 跑在我的 MacBook 上"，而不是隐式的。

### 阶段二：补齐实时控制与运维可见性（2~3 周）
4. WS2：WS 取消推送（D5）
5. D4 的三档离线语义落到前端可见性 + 运维指标
6. WS5：Helm 补齐

**产出**：取消不再慢一拍；"任务卡在一台离线的机器上"这件事不再隐形。

### 阶段三：云端执行面（4~8 周，可选）
7. WS4：`server/runtime` 生产就绪（测试 / 安全审计 / 消息适配 / session 对接）
8. cloud runtime 上线，仅 anthropic / openai
9. 前端双 runtime 并列展示

**产出**：无本地 CLI 环境的用户（CI、容器、纯前端同学）也能用。

---

## 6. 风险

| 风险 | 可能性 | 影响 | 处置 |
|---|---|---|---|
| 把 `mul_` PAT 当长期凭据常驻用户机器 | 中 | 高（用户级过度授权） | D3 强制分层；daemon 侧只接受 `mdt_`/managed token 作长期凭据 |
| 云端 GC 误回收挂着任务的 runtime | 中 | 高（任务丢失） | D4-T3：回收前校验 `agent_task_queue`；GC 只收空 runtime |
| 用户以为"云端有备份"而清理本机目录 | 中 | 中（会话/产物丢失） | 产品文案明确：本机是唯一权威副本 |
| `server/runtime` 进程内执行越权 | 低 | 高 | D6 前置条件：sandbox 安全审计未完成不上线 |
| 自动 fallback 被"顺手"加进来 | 中 | 高（语义混乱） | D2 写进 CLAUDE.md 作为硬规则：不做执行路径 fallback |
| session store 误放进 `WorkspacesRoot` 被 GC 删 | 低 | 高 | WS6-4 回归验证（已有踩坑记录） |

---

## 7. 一句话总结

**这个项目的混合模式不是要新建，而是要"扶正"**：协议、数据模型、离线容忍、认证分层全都建好了，甚至 `runtime_mode='cloud'` 的枚举值都躺在那 500 多个迁移文件的第一批里。真正要做的是三件事 ——

1. 让「执行位置」在界面和 API 上显式可见（而不是隐式全 `local`）；
2. 把「取消」从轮询升级为推送（唯一的实时性硬伤）；
3. 明确写出离线三档语义并做成可观测指标（而不是让状态隐形）。

云端执行面（cloud runtime）是**并列的第二条腿**，不是第一阶段的必需品，且必须等 `server/runtime` 生产就绪。
