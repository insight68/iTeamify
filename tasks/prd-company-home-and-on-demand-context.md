---
title: Company Home and On-demand Company Context - PRD
type: feat
date: 2026-08-07
topic: company-home-and-on-demand-context
status: implemented
execution: implemented
---

# PRD：从 Workspace 升级为 Company，并为 Agent 提供按需公司上下文

> **2026-08-08 交互决策更新：** 公司根页面在产品中统一命名为“基础信息”，展示一份持续生效的公司业务档案。Owner/Admin 可以点击任意信息卡片直接编辑并保存，也可以在 AI 对话中确认后更新；不再向用户展示草稿、变更提案、发布动作或版本历史。系统仍在后台保存不可变快照和修订号，仅用于并发保护、审计以及 Agent/Leads 任务复现。本文后续出现的 Draft、Proposal、Publish 等描述仅保留为早期方案背景，以本条更新为最终交互合同。

> **产品合同：** V1 中，一个 Workspace 代表且只代表一家公司。用户界面统一使用“公司”概念；`workspace_id` 继续作为底层租户、权限和数据隔离键。`/{workspaceSlug}/` 成为公司的“基础信息”主页，展示当前生效的公司业务事实；公司信息既可在结构化页面中点击编辑，也可通过 AI 对话确认后更新。Settings 只负责公司身份、URL、成员、集成和危险操作。生产 Agent 不再自动接收完整 `workspace.context` 或整份公司资料，而是从任务锁定的后台快照中按需读取特定范围。

## 1. Introduction / Overview

### 1.1 要解决的问题

当前产品同时存在三个相互重叠的概念：

- Workspace：用户可以设置名称、Logo、描述、Context、Slug 和 Issue 前缀。
- Business：保存定位、服务、目标客户、Buyer Persona、证据和来源，并支持草稿、AI 提案与发布版本。
- Knowledge：以“知识库总览”解释 Business，但目前没有真正独立的文档/RAG 能力。

这会让服务型公司的用户不知道：

- “我的公司信息到底在哪里看？”
- “Workspace description、Workspace context 和 Business summary 有什么区别？”
- “为什么进入公司后先看到 Leads，而不是公司的业务基础？”
- “Agent 每次究竟读取了哪一段信息、哪一个版本？”

本功能把产品模型收敛为一个用户可理解的对象：**Company**。Company 是用户经营业务时面对的主对象；Workspace 退回为实现层的租户和权限边界。

### 1.2 已确认的产品决策

| 决策 | 结论 |
| --- | --- |
| Company 与 Workspace 的关系 | V1 一对一；一个 Workspace 就是一家公司 |
| 公司根页面默认状态 | 默认展示已发布版本；管理员可切换查看草稿 |
| 主要维护方式 | 根页面结构化阅读，AI 对话录入/完善；Settings 只保留管理配置 |
| “按需加载”的范围 | 主要针对 Agent 上下文；公司页面可以一次读取并展示完整结构化资料 |

### 1.3 核心判断

这不是把 `/business` 简单搬到根路由，也不是把一个巨大的业务表单塞进 Settings。正确的模型是：

1. **Company 是产品聚合对象。** 名称、Logo、成员、服务、客户画像和业务边界都属于公司。
2. **不同信息保留不同生命周期。** Slug、成员、集成等系统配置即时生效；业务事实经过 Draft、Review、Publish。
3. **同一份数据只保留一个权威来源。** Root 页面、Settings 和 Agent 工具都读取同一个 Company aggregate，不进行双向同步或复制编辑。
4. **页面完整可读，Agent 语义按需。** 人需要建立完整认知；Agent 只取完成当前任务必需的事实，避免无关上下文污染判断。

## 2. Goals

- 让用户进入 `/{workspaceSlug}/` 后立即知道“这家公司是谁、卖什么、服务谁、为什么可信”。
- 消除 Workspace description/context 与 Business summary/positioning 的重复含义。
- 保留 `workspace_id` 作为稳定的租户、权限和数据隔离键，避免无价值的底层重构。
- 将现有 Business 的草稿、发布、AI 提案和 Prospector 快照能力升级为 Company 能力。
- 让公司信息的主要录入过程发生在 AI 对话中，并将结果转化为可审阅的结构化变更提案。
- 生产 Agent 只能按需读取任务锁定的已发布公司版本，不默认读取草稿或完整资料。
- 每次 Agent 上下文读取都能回答：读取了哪一版、哪些范围、哪些对象和哪些来源。
- 在不破坏历史任务可复现性的前提下，逐步停止使用 `workspace.context` 作为全局系统提示词。

## 3. Non-goals / Out of Scope

- V1 不支持一个 Workspace 下创建多家公司。
- V1 不支持一家公司的多个独立 Brand 或 Business Unit；未来需要时新增层级，不复用 Workspace。
- 本阶段不建设通用文档库、向量检索、文件夹、Wiki 或完整 RAG 管理界面。
- 本阶段不让 AI 自动应用或发布公司事实。
- 本阶段不把公司根页面做成营收、线索、任务等经营指标 Dashboard。
- 本阶段不要求每个普通 Agent 预加载完整公司上下文。
- 本阶段不允许生产 Agent 读取未发布草稿作为正式事实。
- 不将 Workspace 数据表整体重命名为 Company；底层租户语义继续保留。

## 4. Product Model

### 4.1 Company 是用户模型，Workspace 是系统模型

```text
Company（用户看到的经营对象）
├── Identity：名称、Logo、Slug
├── Operating Profile：定位、服务、客户、边界、证据
├── People & Access：成员和权限
├── Connections：集成、仓库、运行环境
└── Work：Leads、Inbox、Issues、Agents、Autopilots

Workspace（系统内部租户）
├── workspace_id
├── membership / authorization
├── data isolation
├── routing slug
└── realtime / runtime namespace
```

所有现有 `workspace_id` 过滤、成员权限、Header 和实时订阅机制继续使用 Workspace。用户界面、路由标题、空状态和帮助文案使用 Company。

### 4.2 Company aggregate 的两个生命周期

| 类型 | 字段示例 | 生命周期 | 权威来源 |
| --- | --- | --- | --- |
| 公司系统身份 | 内部显示名称、Logo、Slug、Issue prefix | 管理员修改后即时生效 | Workspace metadata |
| 公司业务事实 | 官网、公开品牌名、简介、定位、服务、目标客户、Persona、证据、原则、排除项 | Draft → Review → Published release | Company operating profile |
| 公司治理 | 成员、角色、集成、仓库、删除/退出 | 即时操作，按权限控制 | 现有 Workspace services |

“内部显示名称”用于导航、Workspace switcher 和成员协作。“公开品牌名”是可选业务事实；为空时 Agent 和页面使用内部显示名称。这样既避免要求用户重复输入，也允许一家服务公司使用不同的对外品牌名。

### 4.3 Company Operating Profile schema

现有 `BusinessContent` 已覆盖 MVP 的大部分内容。产品层应将其重命名和组织为以下范围：

| Scope | 内容 | 典型 Agent 用途 |
| --- | --- | --- |
| `identity` | 公开品牌名、官网、业务简介、主要市场 | 识别公司、介绍、报价抬头 |
| `positioning` | 定位、差异化、经营原则 | 线索判断、内容、销售表达 |
| `offers` | 服务、客户结果、交付物、周期、价格说明、适配条件 | 获客、报价、销售、交付 |
| `audiences` | ICP/目标客户、行业、规模、区域、痛点、购买触发、Must-have、排除条件 | Leads 获取和资格判断 |
| `personas` | 角色、职位、目标、痛点、异议、渠道 | 联系人发现和触达 |
| `boundaries` | 公司级排除项、不能承诺的内容、合规边界 | 防止错误销售和越权承诺 |
| `proof` | 案例、结果、证明材料 | Lead 解释、触达、提案、报价 |
| `sources` | 官方 URL、文档引用、对话来源 | 事实溯源与后续检索 |

V1 继续允许一个发布版本包含完整 JSON snapshot。按需读取不要求立即拆成八张表；服务端可以在读取时按 scope 投影 JSON。只有当单个范围需要独立权限、查询或高频写入时，再拆成实体表。

### 4.4 数据权威规则

- `workspace.name` 是应用内公司显示名称的唯一来源。
- `workspace.avatar_url` 是公司 Logo 的唯一来源。
- `workspace.slug` 是公司 URL 的唯一来源。
- `workspace.description` 不再作为独立可编辑字段；其有效内容迁移为 Company `identity.summary` 草稿。
- `workspace.context` 不再是长期业务事实入口，也不再默认注入所有 Agent。
- 已发布 Company release 是生产 Agent 的业务事实唯一来源。
- Company Draft 只供编辑者、公司维护对话和发布预览使用。
- Chat 历史、URL 内容或 AI 推断本身不是正式事实；只有应用到 Draft 并发布后才成为正式事实。

## 5. Information Architecture and Routing

### 5.1 目标路由

| 路由 | 目标职责 |
| --- | --- |
| `/{companySlug}/` | Company Home；完整展示已发布公司档案 |
| `/{companySlug}/leads` | Leads / CRM |
| `/{companySlug}/prospects` | 获客任务 |
| `/{companySlug}/inbox` | 收件箱 |
| `/{companySlug}/agents` | Agents |
| `/{companySlug}/settings?tab=company` | 公司系统身份、URL 和危险操作 |
| `/{companySlug}/business` | 迁移期跳转到 `/{companySlug}/`，不再作为主导航入口 |
| `/{companySlug}/knowledge` | 暂时从主导航隐藏；等通用来源/文档能力成立后再恢复 |

`paths.workspace(slug).root()` 必须从当前的 `/{slug}/leads` 改为 `/{slug}/`。Leads 保持显式路由，不能继续承担公司默认主页职责。

### 5.2 Settings 路由兼容

- 新规范值为 `?tab=company`。
- 旧 `?tab=workspace` 通过现有 legacy tab redirect 机制替换为 `company`。
- UI 中的 Workspace 分组改为当前公司名称，General/Workspace 标签改为“公司设置”。
- 底层组件可以在实现阶段从 `WorkspaceTab` 重命名为 `CompanySettingsTab`。

### 5.3 主导航

- 公司 Logo/名称区域可点击并进入 Company Home。
- 移除单独的 Business 主导航项，避免“公司”和“业务信息”成为两个对象。
- Knowledge 在具备真实文档/来源管理能力前不占据一级导航。
- Leads、Prospects、Inbox、Agents 等成为公司的工作模块。

## 6. Company Home UX

### 6.1 页面定位

Company Home 是公司的**内部数字档案和 Agent 控制面**，不是营销官网，也不是经营数据 Dashboard。它优先回答：

1. 我们是谁？
2. 我们提供什么服务？
3. 哪些客户最适合？
4. 哪些人参与购买？
5. 为什么客户应该相信我们？
6. 哪些事情不做、不能承诺？
7. Agent 当前使用的是哪一版信息？

### 6.2 页面结构

```text
┌─────────────────────────────────────────────────────────────────────┐
│ [Logo] 公司名称                          正式版本 v7 · 2 天前发布   │
│ 一句话业务简介                                                     │
│ 官网 · 主要市场                 [与 AI 完善] [查看草稿 4] [发布]   │
├─────────────────────────────────────────────────────────────────────┤
│ Agent 使用状态：生产任务使用 v7  ·  获客就绪  ·  报价缺少价格规则 │
├─────────────────────────────────────────────────────────────────────┤
│ 公司定位                                                            │
│ 定位陈述 / 差异化 / 经营原则 / 业务边界                             │
├─────────────────────────────────────────────────────────────────────┤
│ 服务与产品                                                          │
│ [服务 A：结果、交付物、周期、价格、适配条件]                        │
│ [服务 B：结果、交付物、周期、价格、适配条件]                        │
├─────────────────────────────────────────────────────────────────────┤
│ 理想客户与买方角色                                                  │
│ [ICP A：行业、规模、地区、痛点、触发、排除项、Personas]             │
├─────────────────────────────────────────────────────────────────────┤
│ 案例、证据与来源                                                    │
│ 案例结果 / 官方页面 / 文件或对话来源                                │
├─────────────────────────────────────────────────────────────────────┤
│ 发布历史与待审核 AI 提案                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 读取状态

- 普通成员默认且只能看到 Published 版本。
- Owner/Admin 默认看到 Published；若有未发布修改，显示清晰的 Draft badge 和“查看草稿”。
- 切到 Draft 后，页面持续显示“草稿不会被生产 Agent 使用”。
- 没有 Published 版本时，页面展示 Draft/空状态，并以“通过对话建立公司档案”为主操作。
- 页面一次读取完整 Company context，按可折叠区块呈现；本阶段不要求区块级网络懒加载。
- Offer、Audience、Persona 数量较多时使用折叠和页面内定位，不通过隐藏字段牺牲“所有数据可见”。

### 6.4 编辑入口

Primary action 为“与 AI 完善公司信息”：

1. 打开共享 Chat 的浮动会话或全页会话。
2. 会话绑定当前 Company、Published release 和 Draft revision。
3. AI 先读取需要维护的 Draft scopes。
4. AI 一次询问一个高价值问题，并总结用户答案。
5. 用户确认后，AI 创建 typed change proposal。
6. Owner/Admin 在 Company Home 查看 diff，选择应用到 Draft。
7. Owner/Admin 发布后，生产 Agent 才能读取新事实。

根页面不提供一个覆盖所有字段的巨大表单。可以为 Owner/Admin 保留“高级结构化编辑”作为后续能力，但不属于 MVP。

### 6.5 Settings 中保留的内容

`Settings → Company` 只包含：

- 公司应用内名称。
- 公司 Logo。
- Workspace/Company URL slug。
- Issue prefix 等系统命名规则。
- 跳转到 Company Home 的“查看和完善公司资料”。
- 离开公司、删除公司等危险操作。

以下字段从 Settings 移除：

- Workspace description：迁移到 Company summary。
- Workspace context：迁移为待审核的 Company facts / boundaries，随后停止作为全局提示词使用。
- 定位、服务、客户画像、案例等所有业务字段：只在 Company Home 通过对话和提案维护。

## 7. Agent On-demand Context Architecture

### 7.1 为什么不能继续全量注入

当前 `workspace.context` 在 daemon claim 阶段注入所有 Issue、Chat、Autopilot 和 quick-create 任务。这个机制存在四个问题：

- 不论任务是否需要，都消耗上下文窗口。
- 自由文本中不同类型事实没有边界，Agent 很难只遵循相关部分。
- 修改后缺少发布版本，长任务和重试可能看到不同含义。
- 无法审计 Agent 到底使用了哪些公司事实。

Company 上下文应从“每次自动塞入完整 Prompt”改为“任务锁定版本 + Agent 按 scope 取用”。

### 7.2 三层上下文

#### Layer 1：任务中的 Company manifest

Agent claim 只携带非常短的 manifest，不携带完整业务事实：

```json
{
  "company_id": "workspace-uuid",
  "display_name": "Northstar Studio",
  "company_release_id": "release-uuid",
  "company_release_version": 7,
  "available_scopes": [
    "identity",
    "positioning",
    "offers",
    "audiences",
    "personas",
    "boundaries",
    "proof",
    "sources"
  ],
  "policy": "Retrieve only the scopes needed for this task. Published facts only."
}
```

Manifest 的目标是告诉 Agent“有一份正式公司资料以及如何读取”，而不是替代资料本身。

#### Layer 2：结构化 scope retrieval

新增或升级工具：

```text
company_context_get(
  scopes: CompanyScope[],
  offer_ids?: string[],
  audience_ids?: string[],
  persona_ids?: string[],
  query?: string,
  max_items?: number
)
```

服务端不接受 Agent 任意指定生产版本。它从当前 task 的 `company_release_id` 读取不可变 release，并返回该版本中请求的范围。

推荐响应：

```json
{
  "company_release": {
    "id": "release-uuid",
    "version": 7,
    "published_at": "2026-08-05T10:00:00Z"
  },
  "requested_scopes": ["offers", "audiences", "boundaries"],
  "content": {},
  "source_refs": [],
  "omitted_scopes": ["proof", "sources"],
  "truncated": false,
  "content_hash": "sha256:..."
}
```

约束：

- 必须至少指定一个 scope。
- 默认只返回 Published release。
- 必须使用 task 锁定的 release，不因新版本发布而改变。
- 支持以 Offer/Audience/Persona ID 进一步收窄。
- 响应必须包含 release ID/version、实际返回范围和截断状态。
- 空字段应显式返回 unknown/missing，不允许 Agent 用推断补成正式事实。
- 同一个 task 对同一 release/scope/filter 的结果可缓存。

#### Layer 3：证据和长资料检索

当 `proof` 或 `sources` 只保存摘要，而 Agent 需要原文证据时，再调用未来的来源检索工具。该能力不属于本 MVP，但 scope API 必须保留 `source_refs`，避免以后破坏协议。

### 7.3 Draft 工具必须与生产读取分开

用于公司维护的 Chat 需要读取 Draft，但不能复用一个允许所有 Agent 切换 `mode=draft` 的生产工具。建议提供：

- `company_context_get`：所有业务 Agent 可用，只读 task-pinned Published release。
- `company_draft_get`：只挂载到 Company maintenance Chat，按 scope 读取 Draft 和 revision。
- `company_change_propose`：只创建提案，不直接修改或发布。

这比现有 `business_context_get` 一次返回 Draft、Published、validation gaps 和完整 content 更安全，也更节省上下文。

### 7.4 任务到 scope 的推荐映射

| 任务 | 首选 scopes | 按需追加 |
| --- | --- | --- |
| Lead discovery | `positioning`, `offers`, `audiences`, `boundaries` | `personas`, `proof` |
| Lead qualification | `audiences`, `boundaries` | 指定 `offers`, `proof` |
| 联系人发现 | `audiences`, `personas` | `offers` |
| 销售触达 | `positioning`, 指定 `offers`, `personas`, `boundaries` | `proof`, `identity` |
| 报价 | `identity`, 指定 `offers`, `boundaries` | `proof` |
| 内容创作 | `positioning`, `identity`, `boundaries` | `offers`, `proof` |
| 交付任务 | 指定 `offers`, `boundaries` | 后续 SOP/Knowledge sources |

映射是默认建议，不应硬编码为唯一组合。Agent 根据当前任务决定是否调用和是否追加 scope；系统负责版本、权限、审计和响应预算。

### 7.5 版本锁定

- 创建 Agent task 时记录当前 `company_release_id` 和 version。
- 任务的重试、恢复、子任务默认继承父任务的 Company release。
- 用户明确选择“使用最新版重新运行”时，创建新的 task/run，不静默替换历史版本。
- Prospector 保留现有不可变 snapshot 语义，并逐步将全量 `business_context` 改为运行所需的最小 snapshot。
- Company maintenance Chat 是例外：它需要读取实时 Draft revision，并使用 revision 处理并发冲突。

### 7.6 审计与可观察性

每次读取记录：

- workspace/company ID。
- task ID、agent ID。
- release ID/version。
- scopes 与对象 ID filters。
- 返回字节数或估算 token 数。
- content hash、cache hit、时间和结果状态。

Company Home 后续可以显示“v7 最近被 12 个任务使用”，但 MVP 只要求后端具备日志和任务版本引用。

## 8. Data and API Design

### 8.1 推荐复用现有结构

现有表已经具备：

- `business_context`：workspace 单例、draft revision、published content。
- `business_release`：不可变 version snapshot。
- `business_change_proposal`：AI typed operations、来源、状态和并发基线。

MVP 不必为了产品命名立刻重建数据。推荐：

- `workspace` 继续作为 tenancy table。
- 现有 Business 表可以在一次受控迁移中改名为 `company_profile`、`company_release`、`company_change_proposal`；若当前分支尚未上线，优先直接改名并移除旧 API，而不是长期维护双套命名。
- 如果数据库改名会扩大当前交付风险，允许先保留物理表名，但 Go/TypeScript/API/UI 的新领域合同统一使用 Company，并明确安排后续单次重命名；不做双写。
- 所有关系继续由应用层和事务维护，不增加数据库 Foreign Key 或 cascade。

### 8.2 Company overview API

```text
GET /api/company
```

一次返回 Company Home 所需的完整数据：

- workspace/company system identity。
- published profile 和 release metadata。
- 对有权限用户返回 draft profile、draft revision 和 validation gaps。
- pending proposal count/list。
- release history summary。
- workflow readiness。

页面可以在 React Query 中使用一个 workspace-scoped key：`companyKeys.overview(wsId)`。无需为了“按需加载”拆成多个页面请求；用户选择的 C 方案只要求 Agent 语义按需读取。

### 8.3 Company maintenance APIs

建议目标接口：

```text
GET  /api/company
PUT  /api/company/draft
POST /api/company/publish
GET  /api/company/releases
GET  /api/company/releases/{releaseId}
GET  /api/company/proposals
POST /api/company/proposals/{proposalId}/apply
POST /api/company/proposals/{proposalId}/reject
```

Chat task-scoped endpoints：

```text
POST /api/chat/company/context/query
GET  /api/chat/company/draft?scopes=...
POST /api/chat/company/proposals
```

所有请求继续通过 `X-Workspace-ID` / task actor context 确定 company scope，不允许客户端跨 workspace 指定 Company ID。

### 8.4 API 兼容

- 新响应继续使用 zod schema + `parseWithFallback`。
- schema 对后端新增字段提供默认值，安装版 Desktop 不因响应漂移崩溃。
- MCP/CLI/内置技能中的 Business 命名应在同一次切换中更新；如果产品未上线，不长期保留旧工具别名。
- 若旧 Desktop 已经分发，服务器端可临时保留旧 endpoint 一个发布周期，但不得双写两份 Company 数据。

## 9. Migration Strategy

### Phase 0：确认数据和发布状态

- 判断当前 Business migrations/API 是否已经进入正式环境。
- 统计 `workspace.description` 和 `workspace.context` 的非空数据。
- 明确旧 Desktop/API 是否需要一个版本周期的读取兼容。

### Phase 1：Company Home 与路由收敛

- 新建 shared `CompanyPage`，复用现有 `BusinessPage` 的结构化 viewer、Draft/Published、proposal 和 publish 能力。
- Web 新增 `/{workspaceSlug}/(dashboard)/page.tsx`。
- Desktop 的 `:workspaceSlug` index 渲染 `CompanyPage`，并调整 tab path sanitizer 不再把裸 slug 强制改到 Issues/Leads。
- `paths.workspace(slug).root()` 返回 `/{slug}/`。
- `/business` 跳转到根页面；主导航移除 Business 与暂未成立的 Knowledge。
- Settings 新增 `company` tab value，`workspace` 作为 legacy redirect。

### Phase 2：Settings 去重与数据迁移

- Settings 仅保留名称、Logo、Slug、Issue prefix 和危险操作。
- 对每个 workspace：
  - 若 Company summary 为空且 `workspace.description` 非空，复制到 Draft `identity.summary`。
  - `workspace.context` 不自动发布；生成 system migration proposal 或导入到 Draft 的“待整理内容”，由 Owner/Admin 审核归类。
  - 不覆盖已有 Company facts。
- UI 停止编辑 description/context；后端字段可以在验证迁移完成后再移除。

### Phase 3：Agent 按需读取

- task 创建时锁定 `company_release_id`。
- daemon claim 移除完整 `workspace.context` 注入，改为 Company manifest。
- 新增 `company_context_get(scopes, filters)`。
- Company maintenance Chat 单独挂载 `company_draft_get` 与 `company_change_propose`。
- 更新内置 skill 和 source map，明确生产 Agent 只读 Published。
- 为 scope 过滤、版本继承、越权、缓存和审计添加测试。

### Phase 4：Prospector 最小上下文

- 保留 job 的 release ID/version 和可复现性。
- 根据选中的 Offer/ICP 生成最小运行 snapshot，而不是保存完整 Company content。
- Lead 结果继续记录使用的 release、ICP/Offer 和匹配依据。

### Phase 5：未来 Knowledge

- 当 URL、文件、SOP、案例原文需要独立管理和语义检索时，再恢复 `/knowledge`。
- Knowledge 成为 Company facts 的证据与长资料层，不再与 Company profile 争夺“业务真相”入口。

## 10. User Stories

### US-001：公司根路由

**Description:** 作为公司成员，我希望进入 `/{companySlug}/` 就看到公司档案，以便理解当前业务基础，而不是被直接带到某个工作模块。

**Acceptance Criteria:**

- [ ] Web 的 `/{companySlug}/` 渲染 Company Home。
- [ ] Desktop 的裸 `/{companySlug}` tab 渲染 Company Home，不被自动改写为 Leads 或 Issues。
- [ ] `paths.workspace(slug).root()` 返回裸公司根路径。
- [ ] 未登录、无成员权限和失效 slug 继续使用现有 guard/error 行为。
- [ ] Typecheck 和相关路由测试通过。
- [ ] Verify in browser using dev-browser skill.

### US-002：完整展示已发布公司档案

**Description:** 作为公司成员，我希望以结构化方式看到所有已发布公司事实，以便知道 Agent 的正式认知是什么。

**Acceptance Criteria:**

- [ ] 默认展示 Published release，而不是 Draft。
- [ ] 展示身份、定位、服务、目标客户、Persona、边界、证据和来源。
- [ ] 每个数组对象保留稳定 ID，页面能展开查看所有字段。
- [ ] 明确显示 release version 和发布时间。
- [ ] 空字段显示“尚未提供”，不显示 AI 猜测值。
- [ ] Typecheck 和 viewer tests 通过。
- [ ] Verify in browser using dev-browser skill.

### US-003：无发布版本的首次建立

**Description:** 作为新公司 Owner，我希望通过 AI 访谈建立第一份公司档案，以便不必理解复杂表单。

**Acceptance Criteria:**

- [ ] 无 Published release 时显示首次建立空状态。
- [ ] Primary CTA 打开真实 Chat composer 并带入公司访谈 prompt。
- [ ] 已有未发送 Chat draft 不被静默覆盖。
- [ ] AI 一次只提出一个聚焦问题，并在确认后创建 typed proposal。
- [ ] 未经人工 apply/publish 的内容不被生产 Agent 使用。
- [ ] Typecheck 和 conversation tests 通过。
- [ ] Verify in browser using dev-browser skill.

### US-004：Published 与 Draft 切换

**Description:** 作为 Owner/Admin，我希望在正式版本和草稿之间切换，以便检查修改而不混淆生产事实。

**Acceptance Criteria:**

- [ ] Owner/Admin 在存在草稿差异时看到 Draft badge 和变更数量。
- [ ] 切换到 Draft 后始终显示“生产 Agent 不使用草稿”。
- [ ] 普通成员不能将 Draft 误认为 Published。
- [ ] 发布成功后 Published version 和 release history 更新。
- [ ] 并发 revision 冲突返回可理解错误且不覆盖他人修改。
- [ ] Verify in browser using dev-browser skill.

### US-005：AI 提案审核

**Description:** 作为 Owner/Admin，我希望审核 AI 对公司事实提出的结构化修改，以便保持公司资料可信。

**Acceptance Criteria:**

- [ ] 提案显示 base revision、字段 diff、理由和来源。
- [ ] Apply 只写 Draft 并增加 revision，不自动发布。
- [ ] Reject 保存拒绝状态和可选原因。
- [ ] base revision 不匹配时提案进入 stale 或返回 revision conflict。
- [ ] Agent 没有直接 publish 权限。
- [ ] 后端事务和权限测试通过。
- [ ] Verify in browser using dev-browser skill.

### US-006：公司设置收敛

**Description:** 作为 Owner/Admin，我希望 Settings 只管理公司系统配置，以便不再面对重复的业务描述和 Context 字段。

**Acceptance Criteria:**

- [ ] `?tab=company` 展示名称、Logo、Slug、Issue prefix 和危险操作。
- [ ] `?tab=workspace` 自动替换到 `?tab=company`。
- [ ] Settings 不再编辑 description/context。
- [ ] 页面提供返回 Company Home 完善业务事实的入口。
- [ ] 现有离开、删除、唯一 Owner 和 cache/navigation 安全规则不回归。
- [ ] Verify in browser using dev-browser skill.

### US-007：旧路由迁移

**Description:** 作为已有书签或 Desktop tab 的用户，我希望旧 `/business` 仍然把我带到公司主页，以便升级后不出现 404。

**Acceptance Criteria:**

- [ ] Web 访问 `/{slug}/business` 使用 replace/redirect 到 `/{slug}/`。
- [ ] Desktop 旧持久化 tab path 被一次性迁移为公司根路径。
- [ ] 主导航不再同时显示 Company、Business 和占位 Knowledge。
- [ ] 路由迁移测试覆盖 Web 和 Desktop。
- [ ] Verify in browser using dev-browser skill.

### US-008：任务锁定 Company release

**Description:** 作为生产 Agent 的使用者，我希望任务固定使用创建时的公司版本，以便重试和历史结果可复现。

**Acceptance Criteria:**

- [ ] 创建任务时保存当前 Published `company_release_id` 和 version。
- [ ] 重试、恢复和默认子任务继承相同 release。
- [ ] 新 release 发布后，进行中的任务仍读取原版本。
- [ ] 无 Published release 时，需要公司事实的生产任务返回明确的前置条件错误。
- [ ] 后端测试覆盖版本继承和新版本隔离。

### US-009：Agent 按 scope 读取公司事实

**Description:** 作为 Agent，我希望只读取当前任务需要的公司事实，以便减少 token、降低干扰并提高判断一致性。

**Acceptance Criteria:**

- [ ] `company_context_get` 要求至少一个合法 scope。
- [ ] 工具只从 task-pinned Published release 读取。
- [ ] 支持 Offer、Audience 和 Persona ID filters。
- [ ] 响应包含 release、requested scopes、omitted scopes、truncated 和 content hash。
- [ ] 请求非法 scope、跨 workspace ID 或 Draft 时被拒绝。
- [ ] 同一 task/release/query 可以命中缓存且返回等价数据。
- [ ] 单元和集成测试覆盖所有 scope。

### US-010：移除全量 Workspace Context 注入

**Description:** 作为平台管理员，我希望 Agent claim 只携带 Company manifest，以便不再把自由文本注入每一个任务。

**Acceptance Criteria:**

- [ ] daemon claim response 不再包含完整 `workspace.context`。
- [ ] claim response 包含 display name、release ID/version、available scopes 和 retrieval policy。
- [ ] Issue、Chat、Autopilot、quick-create 的行为一致。
- [ ] 没有公司 release 的普通非业务任务仍可运行，但 manifest 清晰表示 unavailable。
- [ ] 现有 workspace isolation 校验保持不变。
- [ ] daemon 和 handler tests 通过。

### US-011：迁移旧 description/context

**Description:** 作为已有公司 Owner，我希望旧资料被安全带入新 Company Draft，以便升级不会丢失信息或直接污染正式事实。

**Acceptance Criteria:**

- [ ] 仅在 Company summary 为空时迁移 `workspace.description`。
- [ ] 不覆盖任何已有 Business/Company facts。
- [ ] `workspace.context` 不被自动发布。
- [ ] context 迁移结果以待审核 proposal 或明确的未分类 Draft 数据呈现。
- [ ] 迁移可重复执行且不会重复追加内容。
- [ ] 迁移测试覆盖空值、已有值和冲突值。

### US-012：Prospector 使用最小可复现上下文

**Description:** 作为获客任务用户，我希望 Prospector 使用选中的公司版本和目标客户信息，以便结果可解释且不携带无关资料。

**Acceptance Criteria:**

- [ ] Job 保存 Company release ID/version。
- [ ] Job snapshot 只包含选定 Offer、Audience/ICP、相关 Personas、positioning 和 boundaries。
- [ ] 新 release 不修改历史 Job snapshot。
- [ ] 任务详情能显示使用的 Company version。
- [ ] Runner 不再回退到最新 `workspace.context` 或旧 company profile 设置覆盖 snapshot。
- [ ] 后端、runner 和 UI 测试通过。
- [ ] Verify in browser using dev-browser skill.

## 11. Functional Requirements

- **FR-1:** 系统必须保持“一 Workspace 对应一 Company”的 V1 产品不变量。
- **FR-2:** 系统必须继续使用 `workspace_id` 做权限、数据隔离、Realtime 和 runtime namespace。
- **FR-3:** `/{workspaceSlug}/` 必须成为 Company Home，不能默认跳到 Leads 或 Issues。
- **FR-4:** Company Home 必须默认显示最近一次 Published release。
- **FR-5:** Company Home 必须能完整展示 Company profile 所有结构化字段。
- **FR-6:** 普通成员不得把 Draft 视为生产正式信息。
- **FR-7:** Owner/Admin 必须能通过真实 Chat 发起公司访谈和完善流程。
- **FR-8:** AI 只能创建 reviewable change proposal，不得直接 apply 或 publish。
- **FR-9:** Company facts 发布必须生成不可变、递增版本的 release。
- **FR-10:** `workspace.name`、`avatar_url`、`slug` 必须保持单一权威来源。
- **FR-11:** `workspace.description` 和 `workspace.context` 必须退出日常编辑入口。
- **FR-12:** 旧 description 的迁移不得覆盖已有 Company summary。
- **FR-13:** 旧 context 不得被自动视为已发布事实。
- **FR-14:** Settings 必须提供 `company` tab，并兼容旧 `workspace` tab URL。
- **FR-15:** `/business` 必须迁移到 Company Home，不允许形成第二份公司资料入口。
- **FR-16:** 创建生产 Agent task 时必须锁定 Company release reference。
- **FR-17:** Agent claim 只能携带短 Company manifest，不得携带完整 Company facts。
- **FR-18:** `company_context_get` 必须按 task-pinned release 和显式 scopes 返回内容。
- **FR-19:** 生产 retrieval 不得返回 Draft。
- **FR-20:** Company maintenance Chat 必须使用单独的 Draft read capability。
- **FR-21:** task 重试、恢复和默认子任务必须继承原 Company release。
- **FR-22:** retrieval 响应必须返回 release version、actual scopes、truncation 和 content hash。
- **FR-23:** 所有 Company 读取和变更必须通过 workspace membership/role 校验。
- **FR-24:** API 响应必须使用 schema parsing 和兼容 fallback。
- **FR-25:** 更新 MCP/CLI 产品行为时必须同步更新内置 Company skill 和 source map。
- **FR-26:** Company context 读取必须记录 task、agent、release、scopes、响应大小和结果。
- **FR-27:** Prospector snapshot 必须可复现，不得被后续发布或 Workspace Settings 静默覆盖。

## 12. Technical Considerations

### 12.1 前端边界

- `CompanyPage` 放在 `packages/views/company/`，Web 和 Desktop 共用。
- server state 继续由 React Query 管理；Company query key 必须包含 `wsId`。
- Chat 打开方式继续复用 `packages/core` 中的 chat store/conversation helper。
- shared view 不直接使用 Next.js 或 react-router APIs，只通过 `NavigationAdapter`。
- Web 与 Desktop 都必须有根路由 wiring；Desktop 还需迁移 tab sanitizer 和持久化 path。

### 12.2 后端边界

- Company service 负责 draft、publish、release、proposal、scope projection 和 validation。
- Task service 在创建 task 时解析并保存 published release reference。
- Handler 从 task actor context 推导 workspace/company，不能信任工具输入中的任意 ID。
- 不增加 DB foreign key；dependent cleanup 在 workspace 删除事务中显式处理。
- 如新增 scope 审计索引，必须单文件使用 `CREATE INDEX CONCURRENTLY`。

### 12.3 性能预算

- Company Home 完整 overview API 的典型压缩响应目标小于 512 KB，与现有 content 上限一致。
- Company manifest 目标小于 1 KB。
- 单次 Agent scope 响应默认目标小于 8,000 estimated tokens；超过时设置 `truncated=true` 并要求以 ID/query 收窄。
- immutable release scope 响应可按 `release_id + scopes + filters hash` 缓存。
- 新 release 使用新 ID，自然失效，无需修改旧缓存。

### 12.4 安全与事实治理

- 不把 AI 推断、用户未确认的话或抓取页面内容自动发布。
- 敏感价格说明如果进入 Company profile，未来需要字段级可见性；V1 默认仅 Workspace 成员和 task actor 可读。
- Production retrieval 的权限由 task 与 runtime 的 workspace isolation 决定。
- Response logging 不记录完整敏感 content，只记录 hash、scope 和 size。

## 13. Success Metrics

### 产品理解

- 新用户中，能够在不访问 Settings 的情况下找到公司定位/服务/客户画像的比例 ≥ 90%。
- 与“Workspace、Business、Knowledge 有什么区别”相关的反馈明显下降。
- 从创建 Workspace 到发布第一版 Company profile 的中位时间低于 15 分钟。

### 公司资料质量

- 创建 Prospector job 的公司中，至少有一个 Published release 的比例 ≥ 80%。
- AI proposal 的人工应用率 ≥ 60%，同时保持 AI 自动发布率为 0%。
- 已发布版本中，至少包含一个 Offer 和一个 Audience/ICP 的比例 ≥ 80%。

### Agent 上下文效率

- 普通任务的预注入 Company context token 相比完整注入降低 ≥ 80%。
- Agent 单次 retrieval 的 scopes 中位数不超过 3。
- 100% 的 Company retrieval 可关联到 task 和 release version。
- 新 release 发布后，历史 task 的 retrieval 内容变化率为 0%。

### 获客质量

- 100% 的新 Prospector jobs 保存 Company release reference。
- Lead 结果能够显示使用的 Company/ICP version 和匹配依据。
- 因 Workspace Settings 与 Prospector 配置不一致造成的运行前置错误降为 0。

## 14. Risks and Mitigations

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| “Company” 对独立顾问显得过重 | 用户认知距离 | 文案说明 Company 也代表个人工作室、Agency 或独立服务业务 |
| Settings 名称与公开品牌名混淆 | 重复字段再次出现 | 内部显示名称单一来源；公开品牌名可选，空时自动使用显示名称 |
| 根页面信息太多 | 扫描困难 | 清晰分区、折叠对象、页内目录；数据仍一次加载且可完整查看 |
| Agent 忘记调用 retrieval | 缺少关键上下文 | claim manifest 明确 policy；内置 skill 提供任务到 scope 的选择规则 |
| Agent 过度调用 retrieval | token 与延迟增加 | task 内缓存、scope 数量指标、响应预算和工具说明 |
| context 迁移污染正式事实 | 错误信息进入生产 | 只进入 Draft/proposal，绝不自动发布 |
| 发布后进行中的任务含义改变 | 历史不可复现 | task 创建时锁定 immutable release |
| 物理表和产品命名不同 | 开发认知负担 | 若尚未上线则一次性改名；若需兼容则明确期限，不长期双命名 |

## 15. Rollout and Rollback

### Rollout

1. 先上线 Company Home 与路由，但继续保持旧 Agent context 行为。
2. 验证旧 Business 内容在新页面完整、发布/提案链路无回归。
3. 迁移 description/context 到 Draft 并提示 Owner 审核。
4. 为 task 写入 Company release reference，同时暂不切换 daemon 注入。
5. 上线 scope retrieval 和 Company manifest。
6. 观察 retrieval 成功率、scope 数量和无 release 任务错误。
7. 移除 `workspace.context` 全量注入和旧 Business/Knowledge 导航。

### Rollback

- Company Home 路由问题可暂时将 root 指回 Leads，但不回写或删除 Company data。
- Agent retrieval 问题可在 feature flag 下恢复读取 task-pinned full release snapshot；不得恢复读取“最新 Draft”或无版本 `workspace.context`。
- 数据迁移只复制到 Draft/proposal，不删除旧 description/context，直到一个稳定版本后再清理，因此可安全回看。

## 16. Open Questions

以下问题不阻塞本方案，但需要在进入对应阶段前决定：

1. 产品尚未正式发布时，是否直接将 `business_*` 表和代码命名一次性改为 `company_*`？本 PRD 推荐直接改名，避免长期双语义。
2. 普通成员是否可以查看 Draft？本 PRD 默认普通成员只看 Published，Owner/Admin 可看 Draft；如果未来需要协作审核，应增加明确权限而不是默认开放。
3. Company release 是否需要支持回滚为旧版本？MVP 可先通过“从旧 release 建立新 Draft”实现，不直接修改 published pointer。
4. 哪些 Agent 任务在没有 Published Company release 时必须阻止？建议 Leads、Outreach、Quote 阻止；普通代码/任务协作只显示 unavailable manifest 并继续。
5. `proof` 与 `sources` 何时需要字段级内部/外部可见性？在向客户自动发送内容前必须补充该权限模型。

## 17. Definition of Done

- Company 成为用户唯一的顶层组织概念，Workspace 只出现在底层实现或必要技术说明中。
- 裸 company slug 在 Web/Desktop 均打开已发布 Company Home。
- Settings 不再承担业务事实编辑，也不再出现 description/context 重复入口。
- 现有 Business 数据、Draft、Proposal、Release 被完整继承，没有第二份业务事实源。
- AI 对话能够建立和完善 Company Draft，且发布仍需要 Owner/Admin 人工确认。
- 生产 Agent 不再全量注入 `workspace.context`，并能按 task-pinned release/scopes 读取公司事实。
- Prospector 和其他需要公司语义的任务具备可追溯版本。
- Web/Desktop、Go、TypeScript、MCP/内置技能和关键迁移测试通过。
- 所有 UI stories 已使用 dev-browser skill 进行浏览器验证。
