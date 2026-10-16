# b2b-sdr-agent-template-main 功能分析 & 与 52tuan(iTeamify) 的结合点

> 分析对象：`b2b-sdr-agent-template-main/`（外贸 B2B SDR 智能体模板）
> 对照项目：当前仓库（iTeamify / 52tuan）—— 开源「受管智能体平台」
> 结论先行：**该模板本质上是「OpenClaw 的上下文(prompt) + 部署脚本 + 技能包」，不是一个独立应用**。而 iTeamify 已经原生支持 OpenClaw 作为运行时后端，因此两者不是「要不要集成」的关系，而是「如何把现成的 OpenClaw SDR 智能体收编为 iTeamify 的一名受管 agent」。

---

## 一、它到底是什么（关键认知）

这个模板**没有自己的后端/数据库/服务**，核心价值是三样东西：

1. **7 层 Markdown 上下文文件**（`workspace/` 目录）—— 把一家外贸公司的身份、话术、销售流程、产品、记忆协议、工具配置，全部用自然语言写成 7 个文件，OpenClaw 在每次对话时整包注入。这是「销售大脑」。
2. **部署脚本**（`deploy/`）—— 一条 `./deploy.sh` 通过 SSH 把 OpenClaw gateway + 这 7 个文件 + 技能装到一台 Linux 服务器上，并可选做 WhatsApp 多租户 IP 隔离。
3. **技能包**（`skills/`，外加 clawhub 上的外部技能）—— OpenClaw 约定的 `SKILL.md` 技能，覆盖拟人话术、报价、获客、记忆等。

运行时完全依赖 **OpenClaw Gateway**（一个独立的开源智能体运行时，支持 WhatsApp/Telegram/Email 等多渠道网关）。

---

## 二、功能拆解

### A. 7 层上下文系统（workspace/）
| 文件 | 作用 |
|---|---|
| `IDENTITY.md` | 公司信息、角色、销售流水线阶段、客户分层 |
| `SOUL.md` | AI 人格、沟通风格、硬规则 |
| `AGENTS.md` | **10 阶段销售工作流**（见 B）、BANT 资格认定、多渠道编排、ICP 评分、安全策略 |
| `USER.md` | 老板画像、产品线、ICP 评分、竞品 |
| `HEARTBEAT.md` | **14 项流水线巡检**（见 D） |
| `MEMORY.md` | **4 层防失忆记忆协议**（见 C） |
| `TOOLS.md` | CRM、渠道、集成配置（Jina/Google Sheets/Gmail/Telegram） |

### B. 10 阶段全流水线销售（AGENTS.md）
线索捕获 → BANT 资格认定 → CRM 录入 → 调研富集(Jina AI) → 报价(PDF 形式发票) → 谈判(授权矩阵) → 汇报 → 培育 → 邮件触达(Day1/3/7/14) → 多渠道编排。
- **动态 ICP 评分**：5 维加权 + 交互信号自动加减分（快速回复 +1、要报价 +2、提竞品 +2、7 天不回 -1 等），≥7 标 hot_lead 即时通知老板。
- **授权矩阵**：折扣 ≤5%、标准账期、标准交期 ±5 天以内可自主决定，超出必须升级老板。
- **安全策略**：报价/大额导出/改状态/发新域邮件等敏感操作需审批；防滥用限速（每客每日 ≤5 次 CRM 读、全渠道每小时 ≤20 条出站）。

### C. 4 层防失忆记忆（MEMORY.md）
| 层 | 引擎 | 作用 |
|---|---|---|
| L0 | Active Memory 子智能体 | 回复前自动捞取相关记忆（message/recent/full 模式） |
| L1 | MemOS | 每轮自动抽取 BANT/承诺/异议，对话开始注入 |
| L2 | 主动摘要 | 50% 后台存、65% 用 haiku 级模型压缩（数字/报价/承诺原文保留） |
| L3 | ChromaDB | 每轮存储，按 `customer_id` 隔离 + 自动打标（has_quote/has_commitment/has_objection…） |
| L4 | CRM 每日快照 | 12:00 全量备份到 ChromaDB 作灾难恢复 |
带**降级链**：任一层挂掉都有 fallback，绝不冷启动。

### D. 14 项心跳巡检（HEARTBEAT.md，靠 OpenClaw cron 驱动）
新线索 / 停滞线索 / 报价跟进 / 今日会议 / 培育 / 数据质量 / 邮件序列 / 获客发现(市场轮转: 非洲/中东/东南亚/拉美) / Gmail 收件箱监听 / 竞品情报 / 记忆健康 / CRM 快照 / Teams @提及 / WhatsApp 72h 窗口过期切换。

### E. 多渠道自适应编排
按市场选主渠道（非洲/拉美=WhatsApp，俄罗斯/伊朗=Telegram，中国企=飞书）。Telegram 无 72h 窗口限制、可主动触达；WhatsApp 超 72h 自动切 Telegram/邮件；大文件走 Telegram；正式合同走邮件。支持时区感知发送（11 个时区映射）。

### F. 老账号迁移（whatsapp-old-account-onboarding/）
把客户多年 WhatsApp 销售聊天记录，经 **PII 单向哈希脱敏**后，解析 → 抽取客户画像(MemOS) → 挖掘高转化话术(sales_playbook) → 向量化对话历史(conversation_history)。含 `bootstrap.sh` 一键流程、强制人工复核、灰度发布（影子→白名单→逐步放量）。这是它**区别于普通 prompt 模板**的最有技术含量的部分。

### G. 一键部署 & 多租户隔离（deploy/）
- `deploy.sh`：SSH 装 OpenClaw → 生成 `openclaw.json` → 上传 7 文件 + 技能 → systemd 起 gateway → 装技能包 → 可选 IP 隔离。
- `ip-isolate.sh`：每个租户配独立 Cloudflare WARP 出口 IP（wireproxy SOCKS5），让 WhatsApp 认为是不同设备，避免多账号关联封禁。
- `doctor.sh`：部署后健康自检（SSH/Node/OpenClaw/配置权限/技能/gateway/ChromaDB）。

### H. 技能包
- **本地 8 个**（`skills/`）：`sdr-humanizer`(拟人)、`delivery-queue`(拟人延时发送)、`chroma-memory`、`quotation-generator`(PDF 报价)、`lead-discovery`(获客)、`graphify`(知识图谱)、`telegram-toolkit`、`supermemory`。
- **外部**：`b2b_trade` 配置档拉 41 个 clawhub 技能。技能均为 OpenClaw 约定（`SKILL.md` + 可选 `.mjs/.sh` 脚本），调用 OpenClaw 工具环境（`gws` CLI、`chroma:store`、`memory:add` 等）。

---

## 三、与 52tuan(iTeamify) 的结合点（核心）

### 结合点 0：底层已经打通 ✅
iTeamify 已经**原生把 OpenClaw 当作一种 agent 运行时后端**：
- `server/pkg/agent/openclaw.go`：spawn `openclaw agent --message <prompt> --json`，解析其流式/最终结果 JSON，支持 `local` 与 `gateway` 两种模式，按 `openclaw agents list` 的 agent id 路由。
- `server/internal/daemon/openclaw_runtime_config.go`：agent 的 `runtime_config` JSONB 支持 `mode: local|gateway` + gateway host/port/token/TLS。
- `server/internal/daemon/local_skills.go`：自动扫描 `~/.openclaw/skills`（以及 `~/.agents/skills`）发现技能，可列表/导入到 iTeamify 技能库。

**含义**：这个 SDR 模板里的 OpenClaw agent 和技能，iTeamify 已经能「看见」并「跑起来」，无需改 iTeamify 内核即可接入。

### 结合点 1：把 SDR 直接收编为 iTeamify 受管 agent（最小改动，P0）
把 7 层文件放进一个 OpenClaw workspace，用 `openclaw agents add --model ...` 注册为一个 OpenClaw agent；在 iTeamify 的 `Settings → Agents` 选 OpenClaw provider 连上。**纯配置/部署工作，零代码改动**，SDR 即成为 iTeamify 板上的一名「队友」，拥有头像、可评论、可报告阻塞。

### 结合点 2：技能自动被发现/导入
本地 8 个 SDR 技能就在 `~/.openclaw/skills` 约定下，iTeamify 的 `local_skills.go` 会扫描到它们。注意：纯 prompt 技能可直接复用；调用了 `gws`/`chroma:*`/`memory:*` 等 OpenClaw 工具的技能，**必须经由 OpenClaw backend 执行**才完整生效——而 iTeamify 恰好支持 OpenClaw backend，契合度很高。

### 结合点 3：10 阶段流水线 → iTeamify 的 issue 生命周期（用 iTeamify 当 CRM）
SDR 的 `AGENTS.md` 状态机（`new/contacted/interested/quote_sent/negotiating/meeting_set/closed_won/closed_lost/nurture/email_sent/email_replied`）天然对应 iTeamify 的 issue 状态流转。可把每条线索做成一个 iTeamify issue，**指派给 SDR agent**，于是：
- 可视化看板 + 实时 WS 更新（iTeamify 强项）替代「CRM=Google Sheets」；
- 数据落到 iTeamify 的 Postgres + pgvector，单一系统、可审计；
- 人类随时接手：把 issue 重新指派给自己即可。
这是替换模板对 Google Sheets/Notion 外部 CRM 依赖的最自然方式。

### 结合点 4：14 项心跳巡检 → iTeamify Autopilots
`HEARTBEAT.md` 的 14 个定时检查，几乎一一对应 iTeamify 的 **Autopilots**（cron / webhook / 手动 触发的周期任务）。每个检查做成一条 Autopilot，路由给 SDR agent 执行。iTeamify 的调度/可观测性比 OpenClaw 自带 cron 更统一。

### 结合点 5：审批/人工介入 → iTeamify inbox + 指派
`AGENTS.md` 要求报价、超额谈判、发新域邮件等需老板审批。当前模板靠 WhatsApp/Telegram 管理员消息做审批；iTeamify 的 **inbox + 评论/指派** 是结构化、可留痕的审批面：SDR agent 抛出一个 `[APPROVE]` issue/评论，老板在 UI 里点通过/驳回，状态回写。

### 结合点 6：记忆栈 → 用 iTeamify 的 Postgres+pgvector 重做（可选、更深）
SDR 的记忆依赖 3 个外部服务（MemOS/Supermemory/ChromaDB）。iTeamify 已有 **Postgres + pgvector**。可把「4 层防失忆」概念（客户隔离、自动打标、每日快照、语义检索）在 pgvector 上重做，消除外部依赖、统一运维。代价是需改写 `MEMORY.md` 的指令去调用 iTeamify API/webhook，工程量较大。

### 结合点 7：Webhook 编排 → iTeamify 做控制面
`TOOLS.md` 记录了 OpenClaw 的 webhook-ingress 插件（CRM/自动化 → TaskFlow）。可让 **iTeamify 当上游编排器**：外部 CRM/表单/广告线索事件 → iTeamify webhook → 建 issue 指派 SDR agent → 经 OpenClaw backend 执行。iTeamify 成为控制面，OpenClaw+SDR 成为执行体。

### 结合点 8：产品目录 → iTeamify 资源类型
`examples/*/product-kb/catalog.json` 是一份干净的产品目录 schema（规格、MOQ、交期）。可抽象为 iTeamify 原生「产品目录」资源，既喂 SDR 报价，也可支撑未来的商务视图。

### 结合点 9：多租户 IP 隔离 → iTeamify 运行时隔离
模板的 `ip-isolate.sh`（每租户独立 WARP 出口 IP）是部署层关注点。在 iTeamify 多 workspace 模型下，每个 workspace 可映射一个 SDR 租户；iTeamify 的运行时隔离可为每个租户起独立 OpenClaw gateway、配独立出口 IP。更多是架构对齐，需运行时基建配合。

---

## 四、结合路线图（优先级）

| 阶段 | 内容 | 改动量 | 价值 |
|---|---|---|---|
| **P0 快速验证** | 直接用 OpenClaw backend 把 SDR 接进 iTeamify（结合点 1+2） | 配置/部署，几乎零代码 | 立刻获得一个「能卖货的受管 agent」demo |
| **P1 中期** | issue 当 CRM（结合点 3）+ Autopilots（结合点 4）+ inbox 审批（结合点 5） | 中等：映射状态机、建 Autopilot、接 webhook | 去掉 Google Sheets 依赖，拿到可视化看板与可审计审批 |
| **P2 长期** | pgvector 记忆（结合点 6）+ 多租户隔离（结合点 9）+ 产品目录资源（结合点 8） | 大 | 单一系统、可水平扩展、生产级多租户 |

---

## 五、风险与注意

1. **「agent」概念不对齐**：iTeamify 的 agent 是「一次性任务执行体」（派 issue→跑→回结果）；SDR agent 是「长期持有每客户对话状态的销售人格」。iTeamify 支持 `--session-id` 续会话，但 SDR 的「一客一线、跨数十客户长期记忆」比「一 issue 一任务」复杂——需设计（建议：**一个线索 = 一个 issue**，对话线程挂在该 issue 下）。
2. **外部依赖**：SDR 技能依赖 Jina AI（搜索）、PulseAgent MemOS/Supermemory、ChromaDB、clawhub 技能。集成时要逐个决策「保留 vs 用 iTeamify 原生替代」。
3. **记忆耦合 OpenClaw 工具命令**：`MEMORY.md` 直接调 `chroma:store`/`memory:add`。保留 OpenClaw 作执行体可零改动；若 P2 改 iTeamify 原生记忆，需改写指令。
4. **许可**：SDR 模板为 **MIT-0**（可商用、可改、无需署名），iTeamify 亦为开源，复用/借鉴其 prompt 工程与流程设计无障碍。建议保留其 7 层文件作为「领域知识资产」，而非闭源改写。
5. **拟人合规**：模板要求「永不暴露 AI 身份，伪装成销售顾问」——面向海外 B2B 客户需注意当地对自动营销/披露的法律要求（模板自身也带制裁合规与灰度发布的谨慎设计，可借鉴）。

---

## 六、结论

`b2b-sdr-agent-template-main` 是一份**高质量的「外贸销售智能体领域知识包」**：它的 7 层 prompt、10 阶段流程、4 层记忆、14 项巡检、老账号迁移脚本，都是可以直接复用的销售方法论资产。它不需要被 iTeamify「重写」，而应被 iTeamify「收编」——因为 iTeamify 已经原生支持 OpenClaw 运行时与技能发现，**最小代价**即可让 SDR 以受管 agent 身份跑在 iTeamify 上；进一步用 iTeamify 的 issue/Autopilot/inbox/Postgres 替换模板对 Google Sheets、OpenClaw cron、外部记忆服务的依赖，就能把「一个脚本部署的独立销售机器人」升级为「平台化、可观测、可协作、可多租户的销售智能体中台」。
