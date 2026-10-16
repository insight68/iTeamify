---
title: Business Context, Brand Knowledge and ICP Library - PRD
type: feat
date: 2026-08-07
topic: brand-knowledge-and-icp
status: product-proposal
execution: planning-only
---

# PRD：业务信息（Business Context）与 ICP 画像库

> **产品合同：** 以 `/{workspaceSlug}/business` 建立一个 workspace 级、稳定、可更新、可发布、可追溯的业务上下文。用户既可以在结构化页面中人工编辑，也可以通过绑定业务上下文的 AI 对话生成变更提案；AI 提案经用户审阅后进入 Draft，只有明确发布才成为 Agent 可使用的正式版本。Prospector 不再每次从两个自由文本框重新猜测“卖什么、卖给谁”，而是在创建获客任务时选择已发布的业务/服务/ICP 版本并固化快照；所有 Lead 结果都能解释自己匹配了哪条标准、依据是什么、使用的是哪一版画像。

## 1. Introduction / Overview

### 1.1 为什么这是 AI OS 的基础设施

对于 **AI Operating System for Online Service Business**，Agent 必须拥有一份稳定的业务上下文。否则每个 Agent、每次 Chat、每个获客任务都会重新理解品牌，产生以下问题：

- 同一家公司在不同任务中得到不同的定位和目标客群。
- 品牌信息更新后，正在执行或重试的任务悄悄切换判断标准。
- 用户无法知道某个 Lead 为什么被找到、依据的是哪一版 ICP。
- 定位、服务、案例、禁用表述散落在提示词和文档中，无法统一维护。
- 成交结果无法反馈到 ICP，画像长期停留在主观假设。

`/business` 不是一个“上传文档后聊天”的普通 RAG 页面，而是 Agent 运行所依赖的 **Business Context Control Plane**：人负责维护和发布业务真相，AI 负责访谈、提取、发现缺口和提出结构化修改，生产 Agent 只消费已发布版本，并把结果与证据写回系统。

### 1.2 三种画像必须分开

产品中会出现三个容易混淆的概念：

| 对象 | 回答的问题 | 稳定性 | 示例 |
| --- | --- | --- | --- |
| ICP（Ideal Customer Profile） | 应该找哪类公司/客户？ | 相对稳定、可版本化 | 20–100 人、已进入国际市场的设计服务公司 |
| Buyer Persona（买方角色） | 应该找公司里的谁、他们在意什么？ | 相对稳定、隶属 ICP | Founder、Head of Growth、Marketing Director |
| Customer Profile（真实客户工作台） | 这个具体客户是谁、发生了什么、下一步是什么？ | 持续变化 | Acme 当前在比较两套方案，预算 ¥30k |

ICP 决定 **找谁**，Buyer Persona 决定 **找哪个角色、用什么切入**，Customer Profile 记录 **真实关系和行动**。三者不能使用同一张“画像”表或同一段自由文本表达。

### 1.3 当前实现基础与缺口

当前 Prospector 已有：

- `lead_mining_settings.company_profile` 与 `positioning` 两个自由文本字段。
- Prospector 设置页里的品牌资料表单。
- 新任务表单仍要求重复输入公司信息和产品定位。
- Python runner 在任务开始时读取 workspace 最新设置，并用它覆盖任务输入。
- InsightAgent 从品牌描述推导产品、买方角色和卖点；KeywordGenAgent 再临时推导 buyer profile 与关键词。

这验证了业务链路，但还不是稳定知识库：没有结构化 ICP、服务实体、版本、发布状态、来源、差异对比或任务快照。

## 2. Goals

- 工作区管理员能维护一份统一品牌事实和多份服务/Offer。
- 工作区能创建多份 ICP，每份 ICP 下包含一个或多个 Buyer Persona。
- 用户能从文本、URL 或文件导入资料，让 AI 提取建议字段，但必须人工确认后才能发布。
- 编辑过程使用 draft；Agent 默认只能读取 published 版本。
- 每个 Prospector job 固化品牌、服务、ICP 与评分规则的版本快照。
- Lead 结果显示 Fit、Intent、匹配条件、未满足条件、排除项和证据来源。
- 知识库更新不会改变已运行任务的历史含义。
- 成交/流失数据未来可以用于验证和优化 ICP，而不是自动改写正式版本。

## 3. Product Model

### 3.1 Brand Foundation（workspace 单例）

保存“我们是谁、为什么客户选择我们”：

- 品牌名称、官网、公司简介、主要市场、支持语言。
- 品牌定位：目标对象、品类、核心价值、差异化和可信理由。
- 核心能力与竞争优势。
- 品牌原则、禁用表述、合规边界。
- 品牌语气仅作为后续触达 Agent 的输入，不应与事实知识混在一个字段。

推荐使用明确的 positioning 框架，而不是只提供空白 Markdown：

```text
For [target customer]
who [critical need / pain],
[brand] is a [category]
that [primary value],
unlike [alternative],
because [differentiated proof].
```

### 3.2 Offer / Service Library（多条）

线上服务业务的 ICP 通常与具体服务相关，不能只有一份公司级画像。每个 Offer 至少包含：

- 服务名称、服务类型和一句话价值。
- 解决的问题、预期结果、交付内容、周期。
- 价格模式与典型价格区间；若不公开可标记为内部字段。
- 适用条件、前置条件、不适用场景。
- 差异化、证明材料、典型案例。
- 关联的 ICP 列表。

例如“品牌官网重构”和“海外获客代运营”可能拥有完全不同的 ICP 和买方角色。

### 3.3 ICP Library（多条、可版本化）

每份 ICP 代表一类值得获取的公司或个人客户，建议包含：

#### Business fit

- 客户类型：company / person。
- 行业、商业模式、公司规模、收入/预算区间。
- 地区、语言、服务范围和时区约束。
- 成熟度、技术栈或运营特征。
- 核心痛点、期望结果、购买动机。
- 必须满足条件和明确排除项。

#### Intent signals

- 正向触发：融资、招聘、扩张、新产品、网站改版、供应商切换、公开求助等。
- 负向信号：冻结预算、业务收缩、与服务范围冲突等。
- 每种信号的有效时间窗口。

#### Scoring policy

- Fit 与 Intent 必须分开评分。
- Must-have 条件不满足时可以直接 disqualify。
- Soft criteria 使用显式权重。
- Contactability 可以独立评分，但不能提高业务 Fit。
- Overall tier 可以用于排序，但必须保留分项得分和解释。

#### Positive / negative examples

- 3–10 个理想客户示例及“为什么理想”。
- 3–10 个不适合客户示例及“为什么不适合”。
- 示例是 Agent 的判断参考，不自动成为硬过滤条件。

### 3.4 Buyer Personas（隶属 ICP）

Buyer Persona 描述目标公司内的人：

- 角色名称与常见职位关键词。
- 在购买流程中的角色：决策人、影响者、使用者、财务/采购。
- 主要 KPI、痛点、期望和异议。
- 他们能批准什么、需要谁参与。
- 常用语言、偏好渠道和合适的切入角度。
- 需要避免的说法。

同一 ICP 可以有多个 Persona。例如 Founder 决策速度快但关注 ROI；Head of Marketing 更关心品牌一致性和交付协作。

### 3.5 Knowledge Sources

知识来源支持：

- 人工录入。
- URL 抓取。
- 文件上传：PDF、DOCX、PPTX、TXT/Markdown 等允许类型。
- 后续连接云盘、网站或 CRM。

每个来源保存：标题、类型、原始引用、校验和、提取状态、最近获取时间、创建者和可见性。AI 从来源提取的字段必须回链到具体来源片段。

知识来源本身不是正式业务真相。只有经过人工确认并进入 published version 的字段才是 Agent 默认使用的正式上下文。

## 4. Versioning and Publishing

### 4.1 Draft / Published / Archived

- **Draft：** 管理员可以编辑，成员可以预览，Agent 默认不使用。
- **Published：** 不可原地修改的版本快照，Agent 可使用。
- **Archived：** 不再用于新任务，但历史任务仍可引用。

编辑已发布对象时创建新 draft，发布后生成递增版本号。发布操作展示结构化 diff、影响范围和更新说明。

### 4.2 两类配置必须区别对待

| 配置类型 | 读取策略 | 原因 |
| --- | --- | --- |
| 模型、API Key、rate limit | 执行时读取最新安全配置 | 属于运行基础设施，可轮换 |
| 品牌、Offer、ICP、Persona、评分规则 | 创建任务时固化版本和快照 | 属于业务语义，必须可复现 |

当前 Python runner 每次执行读取最新 `company_profile` / `positioning` 的行为应被替换：runner 继续读取最新的加密模型与搜索配置，但业务上下文必须来自 job snapshot。

### 4.3 Job Snapshot

每个 Prospector job 至少保存：

- `brand_version_id`
- `offer_version_id`
- `icp_version_id`
- `context_snapshot`：运行所需的不可变结构化 JSON
- `snapshot_hash`
- 创建任务时的自定义市场/数量/排除项覆盖

任务详情页显示“使用 ICP：精品设计工作室 v4”，并允许查看快照。知识库发布 v5 后，旧任务仍显示 v4；用户可以明确选择“基于 v5 重新运行”，不能静默重算。

## 5. Agent Consumption Contract

### 5.1 新建获客任务

新任务表单不再要求重复填写大段“公司洞察 + 产品定位”，而是选择：

1. Offer / 服务。
2. ICP。
3. 目标市场或本次地域覆盖。
4. 目标 Lead 数量。
5. 可选的本次任务补充约束。

表单右侧提供 **“Agent 将使用的上下文”** 预览，展示版本、主要筛选条件、排除项和 Buyer Personas。若没有已发布品牌/ICP，任务按钮禁用，并引导先完成知识库最小配置。

### 5.2 Prospector pipeline

推荐的新执行流：

```text
Published Brand + Offer + ICP
            │
            ▼
      Immutable Job Snapshot
            │
            ▼
   Query Plan / Search Strategy
            │
            ▼
 Search → Enrich → Identity Dedup
            │
            ▼
 ICP Assessment (Fit + Intent + Evidence)
            │
            ▼
 Qualified Lead Pool → Customer Workspace
```

InsightAgent 不应再从零猜测公司定位。它可以验证快照是否完整、生成本次 query plan，但不能重新定义正式 ICP。KeywordGenAgent 使用结构化 ICP、Buyer Persona、市场语言和 intent signals 生成关键词。

### 5.3 Retrieval policy

不要把整个知识库拼进每次 Prompt：

- 稳定、短小、影响决策的字段使用结构化 snapshot。
- 案例、FAQ、证据和长文档通过按需检索获取。
- 检索结果必须包含 source ID、片段和更新时间。
- Agent 只读取本任务允许的已发布版本和关联来源。
- 对搜索/评分没有影响的视觉规范、语气规则不注入 Lead discovery。

### 5.4 Lead Assessment

每个被保存的 Lead 生成一条独立 assessment，而不是只覆盖现有 `quality_score`：

- 使用的 ICP/version。
- `fit_score` 与 tier。
- `intent_score` 与有效期。
- `contactability_score`。
- 命中的 criteria 与证据。
- 未知条件。
- 命中的排除项。
- 一句话解释和置信度。
- 评估时间。

同一 Lead 可以在不同 ICP 或新版本下重新评估并保留历史。

Lead 列表应直接显示：

```text
Fit 86 · Intent 62 · A 级
匹配：行业、规模、目标市场、正在招聘 Growth 负责人
未知：预算
依据：官网、招聘页、近期新闻 · ICP v4
```

## 6. Information Architecture and UX

### 6.1 为什么路由使用 `/business`

`knowledge` 描述的是存储形式，容易让用户联想到文档库、Wiki 或 RAG；`business` 描述的是业务对象和决策上下文。这里管理的是“我们是谁、卖什么、服务谁、为什么可信、哪些事情不能做”，未来同时服务获客、触达、报价、交付与客服，因此规范路由使用：

- 总览：`/{workspaceSlug}/business`
- 业务资料：`/{workspaceSlug}/business/profile`
- 服务列表：`/{workspaceSlug}/business/offers`
- 服务详情：`/{workspaceSlug}/business/offers/{offerId}`
- 目标客户列表：`/{workspaceSlug}/business/audiences`
- 目标客户详情：`/{workspaceSlug}/business/audiences/{audienceId}`
- 证据与案例：`/{workspaceSlug}/business/proof`
- 资料来源：`/{workspaceSlug}/business/sources`
- 发布记录：`/{workspaceSlug}/business/releases/{releaseId}`

用户界面使用“业务信息”“服务”“目标客户”等自然语言；ICP 作为目标客户编辑器里的专业概念和评分模型出现，不要求所有用户理解路由里的缩写。

### 6.2 `/business` 总览

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 业务信息       正式版本 v7 · 2 天前发布                                  │
│ 所有 Agent 共享的品牌、服务和目标客户认知         [与 AI 完善] [发布更改] │
├────────────────────────────────────────────────────────────────────────────┤
│ 获客：已就绪   触达：缺少语气规则   报价：1 个服务缺少价格   2 项冲突      │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ 当前草稿                              │ AI 业务助手                         │
│                                      │                                     │
│ 业务资料                              │ “告诉我你的网站，或者直接说说你     │
│ 一句话定位、差异化、边界   完成 80%   │  最想服务哪类客户。”                 │
│                                      │                                     │
│ 服务  3                              │ [输入消息 / 添加 URL / 上传资料]      │
│ 官网重构 · 增长顾问 · SEO 诊断        │                                     │
│                                      │ ┌─ 待审核提案 ────────────────────┐ │
│ 目标客户  2                          │ │ 补充核心差异化                    │ │
│ 独立设计工作室 · 跨境 SaaS 团队       │ │ 修改目标公司规模                  │ │
│                                      │ │ [查看差异] [应用所选]             │ │
│ 证据与来源  12                       │ └─────────────────────────────────┘ │
│ 2 个需要重新验证                     │                                     │
└──────────────────────────────────────┴─────────────────────────────────────┘
```

大屏采用主内容 + 右侧 AI 助手的双栏布局；AI 面板默认约 360–420px，可折叠。与客户详情页不同，AI 对话在 `/business` 是核心创作方式，因此可以常驻。窄屏时 AI 助手变为 Sheet，结构化编辑器保持全宽。

页面不显示一个脱离业务意义的统一“82% 完整度”。改为按工作流展示 readiness：

- **获客就绪：** 业务资料 + 至少一个已发布 Offer + 一个已发布 Audience/ICP。
- **触达就绪：** 获客就绪 + Buyer Persona + 证明材料 + 语气/禁用表述。
- **报价就绪：** Offer 包含范围、交付方式、价格规则和商务边界。
- **交付就绪：** Offer 包含交付物、周期、依赖和验收规则。

### 6.3 人工编辑流程

人工编辑不是一个大 Markdown 页面，而是结构化字段与补充说明结合：

1. 用户点击某个卡片或进入子路由。
2. 页面读取 published version 与当前 draft revision。
3. 字段修改自动保存到 Draft，但不会影响生产 Agent。
4. 每个字段显示来源状态：人工确认、来源支持、AI 推断、待核验、存在冲突。
5. 右侧 **Agent Context Preview** 展示该 Draft 发布后 Agent 实际获得的结构化上下文。
6. 并发保存携带 `revision`；版本冲突时展示字段差异，不静默覆盖。
7. 返回总览后，顶部持续显示“有未发布更改”。

字段应允许“暂时未知”，不要逼迫用户填充虚假信息。清空字段、删除 Offer/Audience、修改硬排除条件属于高影响操作，需要二次确认并展示受影响的工作流。

### 6.4 AI 对话建立业务信息

AI 对话有两种入口：

- **首次建立：** 空状态中的“与 AI 建立业务信息”。AI 以访谈方式完成最低可用配置。
- **持续完善：** 总览或任意详情页的“与 AI 完善”。AI 自动知道当前页面、published version、draft revision 和缺失字段。

首次访谈建议按以下顺序进行，每次只追问最影响下一步的一到两个问题：

1. 业务名称、官网、业务类型和主要市场。
2. 当前提供的服务及其典型结果。
3. 最希望服务、最容易成功的客户。
4. 客户为什么现在需要该服务，为什么选择你。
5. 已有案例、证明、价格与交付边界。
6. 明确不服务的客户和不能承诺的内容。

AI 可以读取用户在对话中添加的 URL、文件和文字，但不得把聊天里出现的所有内容自动视为事实。它需要区分：

- 用户明确确认的事实。
- 来源支持的事实。
- AI 推断或待验证建议。
- 与现有正式信息冲突的内容。

### 6.5 AI 变更提案，而非隐式写入

AI 对业务数据的标准输出不是一段总结，而是一个或多个结构化 `Change Proposal`：

```text
提案：完善“品牌官网重构”服务
基础：Business v7 / Draft revision 12

+ 目标结果：在 6–8 周内上线可转化、可维护的品牌官网
+ 适合客户：完成品牌升级但官网仍停留在旧定位的团队
~ 典型周期：4–6 周 → 6–8 周
! 待核验：价格区间 ¥80,000–¥150,000（来自历史方案）

来源：官网服务页、2026 品牌方案.pdf、当前对话
[查看全部差异] [应用 3 项] [拒绝]
```

提案规则：

- 使用受限 JSON Patch/typed operations 表达，只允许修改业务 schema 已声明的路径。
- 保存 `base_revision`、目标对象、字段差异、理由、来源、置信度和创建它的 task/session。
- 默认由用户逐项选择后应用到 Draft；MVP 不允许 Agent 直接发布。
- 应用时服务端重新检查 base revision 和权限，并在一个事务中写 Draft、递增 revision、记录审计事件和更新 proposal 状态。
- Draft 在提案产生后已被他人修改时，提案进入 `stale`；必须重新比较或重新生成，不能盲目应用。
- 用户可以在对话中要求 AI 修改提案，但每个新提案保留替代关系，历史不覆盖。

### 6.6 对话与页面的联动

- AI 提到“服务”“目标客户”或具体字段时，消息中的实体可以点击定位到左侧对应区域。
- 用户在左侧选中某个 Offer/Audience 后，AI 面板自动切换上下文，但不创建新会话。
- 应用提案后，React Query 更新 Draft；左侧字段出现轻量高亮并可撤销本次应用。
- 手工修改后，AI 能看到新的 draft revision，旧提案按 revision 规则失效。
- 发布后，会话继续保留，但下一轮读取新的 published release 和空/新 draft。
- 对话历史不是正式业务信息；只有应用到 Draft 并发布的内容才是生产真相。

### 6.7 发布体验

发布是 workspace 级 **Business Release**，不是逐字段即时生效：

1. 用户点击“发布更改”。
2. 系统展示 profile、offers、audiences、proof 的结构化 diff。
3. 展示 readiness 变化、冲突/待核验项及受影响 Agent/工作流。
4. 管理员填写简短发布说明。
5. 服务端在事务中固化各实体版本并创建 release manifest，例如 `Business v8`。
6. 发布成功后发出 WebSocket 事件，使消费者刷新可用版本。

允许发布部分完整但有警告的信息；不允许发布 schema 错误、引用已归档对象、Offer 无名称/价值、Audience 无 fit 条件等阻断性错误。Prospector 只允许选择满足“获客就绪”的 release 组合。

### 6.8 导航位置

“业务信息”应放在 workspace 业务导航，与 Prospector 和客户并列，不放在模型/API Key 设置中。建议业务流顺序为：

```text
业务信息 → 外贸获客 / Prospector → 客户 → 关注事项
```

模型、搜索供应商和密钥继续留在系统/Prospector 配置；`/business` 只保存业务语义。

## 7. Data Model Recommendation

推荐实体：

- `business_profile`：workspace 级稳定 ID、当前 draft 与 release 指针。
- `business_profile_version`：状态、结构化 content、base version、draft revision、发布人和发布时间。
- `business_offer` / `business_offer_version`：服务稳定 ID 与 draft/published versions。
- `business_audience` / `business_audience_version`：目标客户/ICP 稳定 ID 与 versions；Buyer Personas 第一版存于 audience version 的受 schema 校验内容中。
- `business_source`：manual / url / attachment，包含 checksum、抓取状态和 freshness。
- `business_source_excerpt`：被 AI 引用的稳定片段、位置和内容 hash。
- `business_source_link`：版本字段/事实到来源片段的关联。
- `business_release`：workspace 级递增版本和 manifest，指向本次正式启用的 profile/offer/audience versions。
- `business_chat_binding`：将现有 `chat_session` 绑定到 business profile、当前编辑对象和模式（setup/refine）。
- `business_change_proposal`：AI 生成的 typed patch、base revision、来源、状态与审计信息。
- `lead_assessment`：Lead 对某个 ICP version 的一次评分结果。

所有表显式包含 `workspace_id`。不添加数据库外键或级联；发布、归档、删除来源时由应用层在事务中验证依赖和执行清理。所有索引使用独立迁移的 `CREATE [UNIQUE] INDEX CONCURRENTLY`。

版本的结构化正文可以使用经过 schema 验证的 JSONB，以便第一版快速演进；稳定查询字段和关系字段应使用独立列，不要把 ID、状态、workspace、版本号全部塞进 JSONB。

### 7.1 Change Proposal 状态机

```text
pending ──> applied
   ├──────> partially_applied
   ├──────> rejected
   ├──────> superseded
   └──────> stale
```

- `pending` 提案不改变 Draft。
- `applied/partially_applied` 记录实际采用的 operation IDs 和新 revision。
- `stale` 表示基础 revision 已变化，不等于内容一定错误，但禁止直接应用。
- 提案和 Chat 消息保留，不随发布删除。

### 7.2 复用现有 Chat 的方式

复用 `chat_session`、`chat_message`、附件、pending-message、Agent task 和 WebSocket，不实现第二套聊天后端。通过专用创建入口生成/恢复绑定会话：

- `POST /api/business/chat/sessions`
- 服务端在一个事务中创建普通 Chat Session 与 `business_chat_binding`。
- Agent task 通过 binding 获得 workspace、business ID、当前 draft revision 和受限 MCP 工具。
- 不复用现有 `project_id` 表达 business context；两者语义不同，避免未来同时需要项目与业务上下文时冲突。

Agent 侧新增受限工具建议：

- `business_context_get`：读取 published、draft、readiness 与当前对象。
- `business_source_search`：按需检索允许的来源并返回引用。
- `business_change_propose`：创建结构化变更提案，不直接修改正式数据。
- `business_proposal_get`：读取提案状态，便于继续讨论。
- `business_draft_validate`：预览阻断错误、警告和工作流 readiness。

`business_publish` 不暴露给 Agent；发布只由 authenticated member API 执行。

### 7.3 API 轮廓

- `GET /api/business/overview`
- `GET/PATCH /api/business/profile/draft`
- `GET/POST/PATCH /api/business/offers[...]`
- `GET/POST/PATCH /api/business/audiences[...]`
- `GET/POST /api/business/sources`
- `GET /api/business/proposals?status=pending`
- `POST /api/business/proposals/{id}/apply`
- `POST /api/business/proposals/{id}/reject`
- `POST /api/business/validate`
- `POST /api/business/publish`
- `GET /api/business/releases/{id}`
- `POST /api/business/chat/sessions`
- `GET /api/internal/business/context?...`（仅授权的 Agent task）

所有 Patch/Apply 请求携带 `expected_revision`。响应按 API compatibility 规则通过 zod schema 和 `parseWithFallback` 解析。

## 8. MVP Scope

### 8.1 MVP 必须包含

- `/business` 业务信息总览、子路由与导航。
- 一个 Brand Foundation。
- 多个 Offer。
- 多个 ICP，每个 ICP 支持多个 Buyer Persona。
- 人工结构化编辑、自动保存 Draft 和 revision 冲突处理。
- Draft / Business Release / Archived 与版本历史。
- Manual / URL / File 三类来源中的 Manual + URL；文件上传可复用现有存储后接入。
- 复用现有 Chat 的 AI 业务访谈与持续完善入口。
- AI 从对话/来源生成 Change Proposals，用户审核后应用到 Draft。
- Proposal 的 pending/applied/rejected/stale 状态和审计信息。
- workflow-specific readiness 与 Agent Context Preview。
- 新建 Prospector job 选择 Offer + ICP，并固化业务上下文快照。
- Prospector 使用 snapshot 而非运行时最新品牌设置。
- Lead 输出 fit/intention 分数、匹配解释和 ICP version。
- 现有 `lead_mining_settings` 只保留模型/搜索执行配置；品牌字段迁移到知识库。

### 8.2 Non-goals

- 不做任意 Wiki/Notion 替代品。
- 不做通用企业知识图谱。
- 不在 MVP 实现云盘持续同步和复杂 crawler 调度。
- 不允许 AI 自动发布品牌或 ICP 更新。
- 不让 AI 在普通对话中绕过 Change Proposal 直接修改正式业务信息。
- 不因 ICP 更新自动删除、修改或重新评分历史 Leads。
- 不把 Brand Voice/视觉规范全部注入获客任务。
- 不在 MVP 自动依据少量成交结果修改权重；先提供建议与验证报告。
- 不同时维护 Prospector settings 与 Knowledge Base 两套品牌真相。
- 不新建第二套聊天消息、任务队列或附件系统。

## 9. User Stories

### US-001：建立品牌基础

**Description:** 作为 workspace 管理员，我希望维护品牌定位、差异化和业务边界，以便所有 Agent 使用一致的品牌事实。

**Acceptance Criteria:**

- [ ] 管理员可编辑结构化品牌字段并保存 draft。
- [ ] 普通成员只能读取和预览，不能发布。
- [ ] 页面明确展示 draft 与 published 的差异。
- [ ] 发布生成不可变版本号、发布人、时间和变更说明。
- [ ] 类型检查与视图测试通过。
- [ ] 在浏览器验证加载、空态、长内容、权限和发布确认。

### US-002：创建 ICP 与 Buyer Personas

**Description:** 作为业务负责人，我希望定义目标客户公司和购买角色，以便 Prospector 明确找哪类客户、找谁以及为什么。

**Acceptance Criteria:**

- [ ] ICP 支持 must-have、soft criteria、exclusions 和 intent signals。
- [ ] Fit 与 Intent 权重分开配置和预览。
- [ ] 一个 ICP 可以包含多个 Buyer Persona。
- [ ] 用户至少提供一个正向示例或明确跳过该步骤。
- [ ] 发布前校验评分规则无重复、权重合法、排除项无直接冲突。
- [ ] 在浏览器验证完整创建与版本发布流程。

### US-003：通过 AI 对话建立业务信息

**Description:** 作为业务负责人，我希望通过自然对话描述业务，让 AI 追问关键信息并生成可审核的结构化修改，以便无需先理解复杂表单。

**Acceptance Criteria:**

- [ ] `/business` 可以创建或恢复绑定该 workspace 的业务 Chat Session。
- [ ] AI 能读取当前 published release、draft revision、readiness 和当前编辑对象。
- [ ] AI 每次修改输出一个结构化 Change Proposal，消息中渲染差异卡片。
- [ ] Proposal 默认不修改 Draft；用户可逐项选择并应用。
- [ ] 应用时检查权限与 expected revision，成功后更新 Draft 和 proposal 状态。
- [ ] Draft 已变化时旧 proposal 标为 stale，不能直接应用。
- [ ] AI 无法调用发布操作。
- [ ] 在浏览器验证首次访谈、持续完善、局部应用、拒绝与 stale 状态。

### US-004：从资料生成知识草稿

**Description:** 作为管理员，我希望上传资料或提供官网，让 AI 生成可审核的品牌/ICP 字段，以便快速完成首次配置。

**Acceptance Criteria:**

- [ ] 支持人工文本和 URL 来源；文件来源使用现有附件存储的安全下载模型。
- [ ] 提取结果逐字段显示来源片段和置信度。
- [ ] 用户可接受、编辑或拒绝每个建议。
- [ ] 未确认建议不会进入 published version。
- [ ] URL 抓取失败、重复来源和过期来源有明确状态。
- [ ] 在浏览器验证提取、审核与错误态。

### US-005：基于已发布 ICP 创建获客任务

**Description:** 作为获客操作者，我希望选择服务和 ICP 创建任务，以便无需重复描述品牌且结果标准一致。

**Acceptance Criteria:**

- [ ] 新任务必须选择一个 published Offer 和 ICP。
- [ ] 创建前展示 Agent Context Preview 和主要排除条件。
- [ ] 服务端保存版本 ID、snapshot 和 hash 后再进入 queued。
- [ ] 后续发布新版本不改变已有任务 snapshot。
- [ ] 任务详情显示所用版本并可查看快照。
- [ ] 在浏览器验证创建、无发布版本引导和历史版本显示。

### US-006：解释 Lead 为什么匹配

**Description:** 作为业务人员，我希望看到 Lead 的 Fit、Intent 和证据，以便判断 AI 找到的客户是否值得行动。

**Acceptance Criteria:**

- [ ] Lead assessment 保存 ICP version、分项得分、tier、理由和证据。
- [ ] must-have 不满足或命中 exclusion 时明确显示 disqualified 原因。
- [ ] 未找到的数据标为 unknown，不按不匹配处理。
- [ ] 用户可提交“判断准确/不准确”和修正原因，但不能修改原始 assessment。
- [ ] 同一 Lead 在新 ICP version 下重新评估时保留历史结果。
- [ ] 在浏览器验证 assessment 展开、证据跳转和空证据状态。

## 10. Functional Requirements

- **FR-1:** 系统必须为品牌、Offer 与 ICP 提供稳定 ID 和不可变 published versions。
- **FR-2:** Agent 默认只能消费 published version；draft 不得进入生产任务上下文。
- **FR-3:** 发布操作必须由 workspace owner/admin 完成并写入审计信息。
- **FR-4:** 每个知识字段必须区分人工录入、AI 提取和来源引用。
- **FR-4A:** 人工编辑必须写入 Draft 并使用 revision 防止并发覆盖。
- **FR-4B:** AI 对话只能创建 Change Proposal；MVP 不得直接写入 published data 或执行 publish。
- **FR-4C:** Proposal apply 必须由 authenticated member 操作并对每个 typed patch 重新校验 schema、权限和 base revision。
- **FR-5:** 新建 Prospector job 必须在服务端生成并持久化业务上下文 snapshot。
- **FR-6:** Prospector runner 必须从 job snapshot 读取业务上下文，不得以最新 workspace 品牌设置覆盖。
- **FR-7:** 模型和 API Key 继续通过安全配置读取，不进入业务 snapshot。
- **FR-8:** ICP 必须分开表达 Fit、Intent、must-have、exclusions 和 unknown。
- **FR-9:** Lead assessment 必须保存 ICP version 和 evidence，不能只返回不可解释的总分。
- **FR-10:** 发布新版本不得修改历史任务、Lead assessment 或客户记录。
- **FR-11:** 所有查询按 `workspace_id` 隔离，来源下载继续执行 membership 校验。
- **FR-12:** 前端 server state 使用 React Query；workspace-scoped query keys 必须包含 `wsId`。
- **FR-13:** 新 API 响应必须使用 zod + `parseWithFallback` 解析并有畸形响应测试。
- **FR-14:** 版本更新通过 WebSocket 失效 React Query，不把知识正文写入 Zustand。
- **FR-15:** AI 业务对话必须复用现有 Chat Session、消息、附件、任务和 pending-message 语义。
- **FR-16:** Business context 使用独立 binding，不得复用 `chat_session.project_id`。
- **FR-17:** 发布必须创建 workspace 级 Business Release manifest，Agent 和 Prospector 能回溯到 release ID。

## 11. Success Metrics

- 新 workspace 在 15 分钟内完成最小 Brand + Offer + ICP 并发布。
- 首次用户在不离开 AI 对话的情况下生成至少一个可发布 Draft 的完成率。
- AI Proposal 的应用率、部分应用率、拒绝率与 stale 率可衡量。
- 90% 以上的 Prospector jobs 使用明确的 published ICP，而不是自由文本输入。
- 100% 的 Lead assessments 可以回溯到 ICP version 和至少一条证据或明确的 unknown 状态。
- 同一 snapshot 对同一固定测试数据的评分结果具有可重复性。
- 用户对 Lead assessment 的“准确”反馈率逐步提升。
- 更新 ICP 后重新运行的高质量 Lead 比例、转入 Customer 的比例和成交率可对比。
- 品牌信息冲突、过期来源和未发布草稿都能在 `/business` 总览被发现。

## 12. Feedback Loop Roadmap

正式闭环不是“AI 自动改画像”，而是：

```text
ICP Hypothesis
    → Leads Found
    → Qualified / Disqualified
    → Won / Lost
    → Pattern Analysis
    → Suggested ICP Revision
    → Human Review and Publish
```

当样本量足够后，系统可以对比 closed-won、closed-lost 和未推进客户，指出哪些 criteria 真正区分成交与流失，并生成 vNext draft。管理员审核后发布，确保业务策略始终有人负责。

## 13. Open Product Decisions

1. MVP 是否允许一个 job 选择多个 ICP；建议第一版限制一个，保证解释和评分清晰。
2. Buyer Persona 是否需要跨 ICP 复用；建议第一版作为 ICP version 的内嵌对象。
3. 文件知识首版支持哪些格式和最大大小；建议先复用现有附件安全模型，解析另建异步任务。
4. 已确定使用 workspace Business Release manifest 保证一次发布的组合一致性；各实体仍保留独立版本，方便复用和回溯。
5. 普通成员是否可以应用 proposal/编辑 draft；建议 MVP 先限制 owner/admin，普通成员可以对话并提交 proposal。
6. 是否允许用户在 Chat 中明确说“直接应用”后免点击确认；建议 MVP 仍要求点击 Proposal 卡片，后续再按 workspace policy 放宽 Draft 写入，发布始终需要显式操作。

## 14. Research References

- Jasper IQ 将 brand voice、knowledge、audiences 和 style guide 分开，并让 Agent 显式应用这些上下文。<https://help.jasper.ai/hc/en-us/articles/18618654325787-Jasper-IQ>
- Jasper Knowledge Base 把产品、定价、定位、目标受众和品牌事实作为可复用知识资产。<https://help.jasper.ai/hc/en-us/articles/18618707176347-Knowledge-Base>
- Apollo 将 Persona 用于职位、行业、地区和公司规模等可复用搜索条件，并提供独立评分模型。<https://knowledge.apollo.io/hc/en-us/articles/4409500253837-Create-a-Persona>
- Apollo custom score 使用可控 signals 对目标公司/人员排序。<https://knowledge.apollo.io/hc/en-us/articles/4877935868045-Create-a-Custom-Score>
- Clay 的 ICP 方法强调从痛点与购买动机出发，并将 Fit 与 Intent 分开评估。<https://university.clay.com/lessons/understanding-your-icp-tam-sourcing>
