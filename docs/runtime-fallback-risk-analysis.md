# 默认 server/runtime + fallback pkg/agent 的风险评估与方案

> 核心结论：**不建议"默认 SDK + fallback CLI"这个模式**。两套执行模型在 provider 覆盖、session、认证、工具、隔离上都不兼容，fallback 不是"降级"而是"换了一个完全不同的 agent"，结果不可预测。建议方案 A。

---

## 一、两套执行模型的根本差异

| 维度 | server/pkg/agent (CLI 子进程) | server/runtime (Open Agent SDK) |
|------|-------------------------------|---------------------------------|
| **执行方式** | spawn 外部 CLI 子进程 | 进程内 agent loop，直接调 LLM API |
| **provider 覆盖** | **27 个 backend**：claude/codex/copilot/cursor/grok/qwen/kimi/kiro/antigravity/codebuddy/deveco/hermes/openclaw/opencode/pi/qoder/traecli... | **仅 2 个**：anthropic、openai（自动探测） |
| **认证模型** | 用户自带 CLI 账号（OAuth/token） | iTeamify 提供 LLM API key |
| **费用归属** | 走用户的 CLI 订阅 | 走 iTeamify 的 LLM 账单 |
| **session 机制** | CLI 原生：claude `~/.claude/projects/`、codex rollout store | JSONL 文件（`runtime/session/`） |
| **工具能力** | CLI 自带（claude computer use、cursor IDE 集成、codex sandbox...） | 24 个内置工具（bash/fileread/glob/grep/webfetch...） |
| **进程隔离** | OS 级进程隔离（子进程崩了不影响 daemon） | 进程内执行（bash 工具直接操作 daemon 内存/文件） |
| **成熟度** | 生产级，27 个 backend 各有测试 | agent 模块 **0 测试**，sandbox **0 测试**，permissions **0 测试** |
| **当前引用** | daemon 实际使用 | **零引用**（vendored 未接通） |

---

## 二、"默认 SDK + fallback CLI" 的 7 个风险

### R1. provider 覆盖断裂（致命）
daemon 支持 27 个 CLI backend，SDK 只支持 anthropic/openai。用户用 cursor-agent / grok / qwen / kimi 的任务，SDK **根本无法承接** → 超过 80% 的任务会直接 fallback，"默认 SDK"形同虚设，却白白增加了 SDK 执行路径的维护成本和失败检测开销。

### R2. session resume 不兼容（致命）
daemon 深度依赖 per-CLI 的 session 机制：
- claude：`~/.claude/projects/<encoded-cwd>/` 查 session
- codex：rollout store + `gateResumeToRolloutPresence` + `PinTaskSession`
- 通用：`PriorSessionID` → `ResumeSessionID` 贯穿 claim/prepare/execute/report

SDK 用 JSONL 文件存 session，与 CLI 原生 session 格式完全不兼容。一个任务如果 SDK 跑了一半 fallback 到 CLI（或反过来），**session 无法衔接**，对话上下文丢失，用户会看到"换了一个 agent 在回答"。

### R3. 语义不一致（严重）
同一个任务用 SDK 跑和用 CLI 跑，**结果可能完全不同**：
- 工具调用行为不同（SDK 的 bash 工具 vs claude 自带的 bash）
- 输出格式不同（SDK 的 `SDKMessage` vs CLI 的 stdout 流）
- token 计费不同（SDK 的 costtracker vs CLI 的 usage report）
- 思考模式不同（SDK 的 ThinkingConfig vs CLI 的 --model/flags）

fallback 后用户看到的执行记录、消息流、计费数据风格突变，无法调试"为什么这次和上次不一样"。

### R4. 认证与费用模型冲突（严重）
- CLI 路径：用户用自己的 claude/codex 订阅，iTeamify 不承担 LLM 费用
- SDK 路径：需要 iTeamify 提供 API key，**每一步都产生费用**

如果"默认 SDK"，意味着 iTeamify 要为所有默认执行的任务买单。fallback 到 CLI 时费用又切回用户 —— 同一个 issue 的不同 run 费用归属混乱，计费报表无法对账。

### R5. fallback 触发条件的语义陷阱（严重）
"fallback"需要判断 SDK 执行失败 —— 但什么时候算失败？
- SDK 启动失败 → 可以 fallback（但 session 未开始，安全）
- SDK 跑了 3 轮工具调用后失败 → **不能 fallback**（已经产生了副作用：文件已改、命令已执行）。fallback 等于让 CLI 从头重来，可能重复执行有副作用的操作

没有一个安全的"fallback 点"：要么 fallback 时任务还没开始（那不如直接选 CLI），要么 fallback 时已经有副作用（不能重跑）。

### R6. 安全隔离不足（严重）
- CLI 子进程：天然 OS 级隔离，崩了不影响 daemon，文件操作限制在 workdir
- SDK 进程内：bash 工具直接在 daemon 进程里 `exec`，操作 daemon 的文件系统

SDK 有 `sandbox/` 模块，但 **0 测试**。在没有充分安全审计的情况下把 SDK 设为默认，意味着 daemon 进程内的 bash 工具可能被 prompt injection 利用，操作 daemon 自己的二进制、配置、其他任务的 workdir。

### R7. 双路径维护成本（中等）
要同时维护 SDK 和 CLI 两条完整执行链路：
- 每个 bug fix 改两处
- 每个 feature（skill bundle、execenv、watchdog、cancel）要在两套模型上各实现一次
- fallback 逻辑本身（检测/状态移交/日志归并）是新的复杂度源
- 测试矩阵从 N×1（N 个 provider × CLI）变成 N×2（N × [SDK+CLI]）

---

## 三、建议方案

### 方案 A（推荐）：SDK 作为独立"云 runtime"类型，与 CLI runtime 并列，不 fallback

**思路**：不做自动 fallback。SDK 和 CLI 是两种**并列的 runtime 类型**，用户/管理员在创建 runtime 时显式选择。

```
runtime 类型:
  ├── CLI runtime    (本地 daemon + pkg/agent)   ← 默认，覆盖 27 个 provider
  └── Cloud runtime  (server-side + server/runtime) ← 可选，仅 anthropic/openai
```

**适用场景分工**：
- CLI runtime：用户有本地 CLI、想用自己的订阅、需要 CLI 专有能力（cursor IDE / codex sandbox）
- Cloud runtime：无本地 CLI 环境（serverless/CI/容器）、想用 iTeamify 托管 LLM、不想装 CLI

**为什么不做 fallback**：
- 两者执行语义不同，fallback = 换 agent，结果不可预测（R3）
- session 不兼容，fallback 丢上下文（R2）
- 没有安全的 fallback 点（R5）
- 并列而非 fallback，各自完整，状态模型独立，无交叉污染

**实施前提**（SDK 生产就绪前必须补）：
1. 给 `runtime/agent/` 写集成测试（当前 0 测试）
2. 对 `runtime/sandbox/` 做安全审计（进程内 bash 工具的隔离）
3. 实现 SDK 的 task 消息流适配（`SDKMessage` → daemon 的 `TaskMessageData`）
4. 实现 SDK 的 session 与 server 侧 `PinTaskSession` 的对接
5. CI 跑 SDK e2e（当前没有）

**改动范围**：
- server 侧新增 `cloudruntime` runtime 类型注册路径（`internal/cloudruntime/` 已存在目录）
- daemon 侧不改（继续用 pkg/agent）
- 新增 `cloudruntime` 执行器：server 进程内直接调 `runtime/agent.New()` + `Query()`
- 前端 runtime 创建页加类型选择

### 方案 B（次选）：per-provider 显式映射，不做全局 fallback

如果一定要让 SDK 承担一部分执行，做 **per-provider 显式映射** 而非自动 fallback：

```
provider == "anthropic" && 配了 ITEAMIFY_LLM_API_KEY  →  用 SDK
provider == "openai"    && 配了 ITEAMIFY_LLM_API_KEY  →  用 SDK
其他所有 provider                                   →  用 CLI（永不尝试 SDK）
```

**为什么比全局 fallback 好**：
- 不存在"SDK 失败后 fallback CLI"的语义陷阱（R5 消除）
- provider 覆盖明确：只有 anthropic/openai 走 SDK，其他直接 CLI（R1 缓解）
- 同一个 provider 不会在 SDK/CLI 间切换，session 兼容性可针对性解决（R2 限定在 2 个 provider 内）
- 费用模型清晰：走 SDK 的 provider 由 iTeamify 出钱，其他走用户 CLI（R4 缓解）

**风险**：仍需解决 SDK session 与 CLI session 的桥接（如果用户先 CLI 跑、后 SDK 跑同一 issue）。建议限制：同一 agent 的所有 run 固定走同一执行路径，不中途切换。

### 方案 C（不推荐）：强行全局默认 SDK + fallback CLI

即用户原始设想。除上述 7 个风险外，还需额外实现：
- fallback 决策引擎（检测 SDK 失败 + 判断是否已有副作用）
- session 跨模型桥接层（CLI session ↔ SDK session 互转）
- 双路径结果归并器（SDK 部分输出 + CLI 部分输出 合并成一条执行记录）
- 费用归集器（区分 SDK 段费用和 CLI 段费用）

**实施成本远高于方案 A**，且产出的是一个语义更混乱的系统。不推荐。

---

## 四、决策矩阵

| 维度 | 方案 A (并列) | 方案 B (per-provider) | 方案 C (全局 fallback) |
|------|:---:|:---:|:---:|
| provider 覆盖 | 完整（各管各的） | 部分（2/27 走 SDK） | 形同虚设（80% fallback） |
| session 一致性 | 各自完整 | 限定 2 provider 内解决 | 需跨模型桥接（极难） |
| fallback 语义陷阱 | 无（不 fallback） | 无（不 fallback） | 有（R5） |
| 维护成本 | 中（两条独立路径） | 中高（2 provider 需桥接） | 高（fallback 引擎+桥接+归并） |
| 费用清晰度 | 高（类型决定归属） | 中（provider 决定归属） | 低（同 issue 混合） |
| 安全隔离 | 高（SDK 在 server 进程，可独立沙箱） | 中 | 低（daemon 内跑 SDK bash） |
| 用户认知成本 | 低（选类型） | 低（透明） | 高（结果不可预测） |

---

## 五、推荐路线

1. **短期**：保持 daemon 用 pkg/agent 不变。把 `server/runtime` 的生产就绪度补齐（测试、安全审计、消息流适配）。
2. **中期**：实现方案 A —— `cloudruntime` 作为独立 runtime 类型上线，与 CLI runtime 并列。先支持 anthropic/openai 两个 provider，验证 server-side 执行的可靠性和成本。
3. **长期**：如果 cloudruntime 验证成功，逐步扩展 SDK 的 provider 支持（通过 OpenAI-compatible gateway 接入更多模型），让更多任务自然走 cloud runtime，而非靠 fallback 强切。

**一句话**：不要用 fallback 把两套不兼容的执行模型粘在一起。让它们各做各的，用户按需选择。
