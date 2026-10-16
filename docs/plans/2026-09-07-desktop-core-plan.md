# Aurocreator Desktop 核心能力补齐方案

审阅时间：2026-09-07。对象为当前 Aurocreator Desktop，参照 `/Users/chunjun/Desktop/Build/Backup/multica-main 20260905/apps/desktop`，并追踪两边关联的 core、views 与必要的服务端代码。本次只分析和制定方案，没有修改业务代码。

**结论：保留当前架构，补齐使用过程中的恢复能力、助手创建续办、客户数据一致性，再优化首屏。** 当前已经拥有任务、项目、助手、聊天、执行记录、自动化、运行环境、附件、收件箱和设置；也已经接入 Aurocreator 的工作台、客户、销售、履约、基础信息、知识、连接和计费。不能把这些作为尚未实现的功能重复建设。

备份值得吸收的是具体机制及其测试，尤其是登录恢复、全局渲染异常恢复、Daemon 生命周期保护、创建助手草稿恢复和桌面快捷键。备份的业务方向不等于 Aurocreator 的业务方向，不做整目录覆盖或整套功能迁移。

**一、业务入口和功能边界**

建议沿用此前提出的四个业务名称组织桌面侧栏，继续使用桌面多标签。它们是信息分组，不要求把每个模块重新做成一个大页面。

| 入口 | 核心内容 | 本次重点 |
|---|---|---|
| 工作台 | 我的待办、待处理客户事项、销售与履约摘要；任务、项目、自动化作为下级入口 | 摘要准确、可进入原对象处理、处理后即时更新 |
| 我的助手 | 助手列表、创建/编辑、对话、运行情况；运行环境、技能作为关联配置 | 创建可续办，离开页面不取消后台任务，失败后有恢复入口 |
| 客户 | 客户详情、跟进、机会、报价/订单、履约 | 保留现有业务模型，补齐跨页面和跨客户端同步 |
| 基础信息 | 公司资料、知识、成员、连接；账号、计费和更新沿用设置入口 | 统一入口归属，权限与原页面保持一致 |

已有任务/项目/客户详情路径、独立任务窗口、深链与标签恢复保持兼容。导航分组不改变公司资料当前规范路径，不绕过首次使用、邀请和创建工作区的 overlay 流程。导航调整单独交付，不与登录恢复一起重构。

**二、确认的缺口与最小改法**

| 优先级 | 当前问题与用户影响 | 最小补齐方案 |
|---|---|---|
| P0 | 启动初始化将 `getMe` 和工作区列表请求放入同一个 `Promise.all`，任何失败都会清凭证并调用退出回调；网络故障或后端短时异常可能停止本地运行环境 | 区分认证失败与暂时不可用；临时故障展示可重试恢复态，不清凭证、不停止任务 |
| P0 | 工作区列表使用 `isFetched` 判断是否可以清理标签；失败也可能被解释为空列表 | 只有本次账号下成功取得的权威列表才能清理无权访问的工作区标签；失败展示恢复态 |
| P0 | AI 创建助手会话 ID 和主要表单只保存在组件状态；组件卸载时删除会话并取消运行任务。桌面切换标签会卸载当前页面 | 草稿按账号、工作区、草稿 ID 保存到 core 的客户端状态；已有 Builder 会话使用可恢复的路由标识。切换标签只离开视图，明确放弃/创建完成才清理会话 |
| P0 | 根节点直接渲染 App；路由错误页无法覆盖侧栏、弹窗、全局 provider 等渲染异常 | 添加轻量根 ErrorBoundary，提供可拖动窗口和重新加载按钮；保留现有卡死诊断，主窗口及独立任务窗口都覆盖 |
| P0 | Daemon 在未确定目标后端时仍能回落默认 CLI profile；目标 URL 和登录同步分属不同 effect | 顺序执行设置目标 URL → 同步凭证 → 自动启动；主进程拒绝未确定目标的写入/启动。保持账号与 profile 隔离 |
| P1 | Daemon 轮询主要更新状态；操作忙时直接拒绝后续操作，缺少完整的意外退出恢复闭环 | 在现有 manager 内补有限恢复策略和小型串行操作保护；用户停止/退出优先，后台恢复受退避和次数上限约束 |
| P1 | 工作台用最多 100 条客户、200 条机会、100 条交易与100 条履约记录在前端计算总数和金额 | 增加窄范围工作台聚合接口；返回准确计数、按币种金额、各类少量待办和统计时间；明细继续使用分页列表 |
| P1 | 客户事件只刷新 leads，报价/订单事件主要刷新聊天，重连没有覆盖 CRM 与 business 的相关缓存 | 为实际业务事件补齐 Query 失效映射；同一业务变更同时更新详情、列表、工作台，重连补偿活跃工作区 |
| P1 | 页面大量静态导入；当前构建入口 JS 约 14.1 MB | 按业务路由和重型弹窗延迟加载；先处理知识/图表、创建助手、设置及重型富文本依赖的导入路径 |
| P1 | 窗口 `sandbox: false`；备份已提供沙箱 preload 配套做法 | 单独小改动启用 renderer sandbox，并调整 preload 打包；专项验证 IPC、PDF、附件与独立窗口 |
| P2 | 备份补充了直接选择标签和打开设置的桌面快捷键 | 沿用现有主进程快捷键和 IPC 通道，补 Cmd/Ctrl+1…9、Cmd/Ctrl+,；使用已有 tab coordinator，不引入另一套快捷键框架 |

登录初始化的实际入口是 `AuthInitializer`，仅修改 auth store 的 catch 不足以修复启动退出问题。还要统一后续 401 的清理路径，并阻止旧账号请求的迟到响应清空新账号会话。

**三、必须写清楚的业务规则**

- **临时断网、会话过期、主动退出是三种结果。** 断网保留身份与可恢复草稿；会话过期清理窗口内账号敏感状态并要求重新登录，Daemon 使用独立 PAT 时不因 UI 凭证过期被停止；主动退出才执行明确的 Daemon 清理。账号切换需要取消旧请求、清旧缓存和窗口上下文，重绑新凭证后启动。
- **只有成功结果才能改变业务归属。** 工作区暂时不可用不能视为已删除；服务端明确返回无权限/已删除，或权威列表确认不存在后，才清理该工作区标签。恢复页不能长期保留已确认失权的数据。
- **草稿与服务端运行分开。** 表单草稿属于客户端，Builder 会话/任务属于服务端。恢复时重新检查权限和真实任务状态，不自动重发提示词、不产生重复任务。表单版本、保存成功、明确放弃和失效会话各有确定处理；禁止把组件卸载当成用户取消。
- **工作台是原业务对象的入口。** 点击摘要进入客户、机会、订单、履约或任务原页面，复用原状态转换与权限校验。后台任务继续用现有任务系统，不给工作台新增一套任务状态机。
- **计数有明确口径。** 同一对象的多类待办若合计展示，明确是“待办事项数”；如果文案是“客户数”，按客户去重。金额按币种分组，保留最小货币单位，不做跨币种相加。到期边界使用明确时区和服务端统计时间。
- **CRM 写入以服务端为准。** 复用已有版本检查与允许的状态转换；冲突时刷新并提示，失败保留输入。写入成功后再跳转；不会把本地点击当作订单或履约已经成功。
- **隔离延续到所有入口。** 新聚合接口、草稿、详情恢复、独立窗口和失效事件都校验账号/工作区；聚合权限与明细权限相同，不能通过摘要获知无权查看的数据。新增 API 继续使用 schema 校验和异常响应测试。

当前页面已经根据跟进时间展示到期事项；“后台主动提醒”和“自动创建履约项目”不应被当成已实现能力。它们不作为本轮恢复/性能改动的前提。后续如纳入业务范围，分别复用现有调度器+收件箱、现有 Project/Issue；明确提醒去重、修改时间后取消旧提醒、订单与履约/项目的幂等关联，不新增通用流程引擎。

**四、架构与性能做法**

保留 Go 模块化单体、现有 PostgreSQL 队列和 Daemon；Electron 主进程负责窗口、IPC、更新和本地进程生命周期。核心认证/缓存/草稿逻辑在 core，共享业务 UI 在 views，纯 UI 在 ui，Electron 与路由接线在 desktop。

保留 React Query 管服务端状态、Zustand 管客户端草稿/筛选/布局。单窗口继续使用单 router、单活跃标签挂载；未激活标签仅保留已有历史和视图快照。对“切换标签丢草稿”的修复落在状态归属，不通过挂载全部标签来掩盖问题。现有聊天已使用虚拟列表，执行记录已有按需获取 transcript 的入口，两者继续复用。

性能优化按以下顺序推进：

1. **建立真实启动基线。** 固定机器、应用版本、账号和数据集，测量冷启动到可交互、恢复已有标签、首次进入重页面；分开记录本地渲染和 API 等待时间。当前 14.1 MB 是构建文件字节数，不能当作运行内存或下载流量。
2. **减少首屏执行的代码。** 路由级 lazy 和重型弹窗 lazy，检查共享 barrel/static import 是否让拆包失效。当前构建已明确提示 emoji picker 的动态导入被其他静态导入抵消。拆包后比较入口及其同步依赖整体，而非只看入口文件缩小。
3. **减少数据传输和重复请求。** 聚合接口用有界、基于集合的查询，避免逐条客户查询；统计准确性不依赖把所有明细拉到浏览器。列表服务端筛选/分页。SQL 先看查询计划，确需索引时依仓库规范以独立 `CREATE INDEX CONCURRENTLY` 迁移添加。
4. **缩小实时刷新范围。** 沿现有机制做按工作区/业务域的合并失效，活跃页面刷新、未挂载页面标记过期，避免每个消息事件刷新整个业务树。保留已有流式消息节流和虚拟列表；只在 profiler 证明有瓶颈时增加局部优化。
5. **约束后台工作。** 页面隐藏且无活动任务时暂停非必要轮询；有活动任务时保持状态可恢复。Daemon 健康检测避免重叠；恢复仅针对 Desktop 管理的进程，主动停止后不得自行拉起。后台进程恢复不等于重试业务任务，不能自动重放有外部副作用的任务。

沙箱属于窗口隔离加固，不能声称它能提升加载速度。备份也仍有 `webSecurity: false`，所以不能把复制配置称为完整安全修复；本轮按其 preload 配套方式落实 sandbox，协议来源/CORS 如需改变另行验证，避免破坏 file 来源下的 API 和附件行为。[Electron 沙箱文档](https://www.electronjs.org/docs/latest/tutorial/sandbox)

先测量、再延后重型模块加载、避免主进程同步阻塞，符合 Electron 的官方性能建议。[Electron 性能文档](https://www.electronjs.org/docs/latest/tutorial/performance)

**五、分批交付与验收**

| 批次 | 交付内容 | 必须通过的验收 |
|---|---|---|
| A：使用不中断 | 认证/工作区恢复、根错误边界、Daemon 目标/profile 顺序保护、助手草稿与会话恢复 | 启动时断网或任一初始化接口 5xx 不清凭证；401/主动退出行为区分；旧请求不影响新账号；切换标签不删 Builder 会话；重新打开草稿不重复提交；侧栏抛错后仍可重新加载 |
| B：业务准确且更轻 | 工作台聚合、CRM 实时/重连同步、路由与重型弹窗拆包、Daemon 有限恢复 | 超过原列表上限时统计仍准确；多币种/边界时间/权限一致；另一个客户端修改后无需手动刷新；重连补齐漏事件；用户停止不会被后台恢复覆盖；启动与内存有前后对照 |
| C：桌面完善 | 四组导航整理、快捷键、sandbox 与 preload 配套 | 旧路径与深链继续可达；标签/设置快捷键无重复标签且尊重 overlay；主/独立窗口、PDF、附件、登录和 IPC 均通过实际 Electron 回归 |

建议的性能验收场景：同机冷启动至少 10 次；20 个已打开标签；1000 条历史消息；10000 条客户测试数据；连续切换标签 100 次后比较回收后内存，不能有持续增长趋势。目标是首次加载 JS 总量显著下降、冷启动可交互时间相对基线改善，不能只靠分包体积下结论。可将首次加载 JS 减少 30%、冷启动中位数改善 20% 设为初始目标，完成运行基线后再确认是否合理；这些是建议目标，尚未实测达成。

本次已经通过：桌面 TypeScript 检查；桌面 47 个测试文件、488 项测试；Electron Vite main/preload/renderer 构建。构建绕过 `bundle-cli`，产物在 `/private/tmp/auro-desktop-review-20260907-ac70722`；入口 JS 14,114,107 字节。构建存在 emoji picker 拆包失效和 CSS highlight 优化器告警，不能解释为功能测试失败。

本次没有启动已登录的实际桌面程序、测量 CPU/内存、连接生产验证业务、制作安装包或发布。测试通过证明当前覆盖范围内的本地基线，不代表上述缺口已被修复。初始审阅 HEAD 为 `ac70722`，审阅期间 HEAD 更新到 `2375fc5`；已核对 desktop/core/views/server 在两个 HEAD 间没有文件差异。

本轮不引入插件市场、自定义工作流、通用动作引擎、自定义状态系统、离线数据库或多标签常驻。保存筛选视图、更丰富的执行记录展示等功能可在具体使用需求确认后小步增加，避免将备份的新增模块全部变成当前范围。

**六、关键代码依据**

- 当前功能与静态导入：[desktop routes](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/renderer/src/routes.tsx:1)。
- 当前初始化失败的实际清理链：[AuthInitializer](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/packages/core/platform/auth-initializer.tsx:91) → [desktop 退出清理](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/renderer/src/App.tsx:348)。
- 工作区列表判定与标签清理：[App](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/renderer/src/App.tsx:195)。
- 活跃标签卸载模型：[TabContent](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/renderer/src/components/tab-content.tsx:15)；创建助手会话卸载清理：[AgentCreationStudio](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/packages/views/agents/components/agent-creation-studio.tsx:288)。
- Daemon 默认 profile 回落：[daemon-manager](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/main/daemon-manager.ts:281)；操作保护：[withGuard](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/main/daemon-manager.ts:801)。
- 工作台分页数据前端统计：[CRMWorkbenchPage](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/packages/views/crm/components/crm-workbench-page.tsx:70)；CRM key 范围：[leadKeys](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/packages/core/leads/queries.ts:5)；事件刷新：[useRealtimeSync](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/packages/core/realtime/use-realtime-sync.ts:1395)。
- 根挂载与窗口配置：[main.tsx](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/renderer/src/main.tsx:30)、[window preferences](/Users/chunjun/Desktop/Build/Agent-harness/aurocreator/apps/desktop/src/main/index.ts:260)。
- 备份可参考：[认证结束分类](</Users/chunjun/Desktop/Build/Backup/multica-main 20260905/apps/desktop/src/renderer/src/platform/session-teardown.ts>)、[登录同步顺序](</Users/chunjun/Desktop/Build/Backup/multica-main 20260905/apps/desktop/src/renderer/src/platform/daemon-login-sync.ts>)、[根错误边界](</Users/chunjun/Desktop/Build/Backup/multica-main 20260905/apps/desktop/src/renderer/src/components/app-crash-boundary.tsx>)、[有限恢复策略](</Users/chunjun/Desktop/Build/Backup/multica-main 20260905/apps/desktop/src/main/daemon-recovery.ts>)、[Builder 会话路由](</Users/chunjun/Desktop/Build/Backup/multica-main 20260905/apps/desktop/src/renderer/src/pages/ai-builder-session-page.tsx>)。
