---
title: Workspace Token Credits and Stripe Prepaid Billing - PRD
type: feat
date: 2026-09-01
topic: workspace-token-credits
status: review-ready
execution: planning-only
---

# PRD: 工作区积分与 Stripe 预付费充值

> 外部 Cloud 计费架构已被 `prd-local-workspace-billing.md` 替代；本文仅保留历史背景，部署以 `docs/local-workspace-billing.md` 为准。

> **产品合同：** 积分是工作区资产，不是用户资产。第一版只支持 Stripe 一次性充值和预付费消费；所有模型、Agent、MCP 与 token 类型统一使用一个由平台 Admin 配置的全局积分费率。新建工作区幂等获得 1000 免费积分，永不过期；存量工作区不补发，既有账号余额不迁移。任务用量按累计值幂等结算到 `iteamify-cloud` 的工作区钱包，并允许全局可配置的软负余额缓冲。

## 1. 背景与问题

现有实现已经能够按统一费率把 token 用量换算为 `credit_micro`，Usage 页面也开始读取工作区余额，但端到端账务合同尚未闭合：

- 余额查询已携带工作区，充值订单、流水、Checkout 与状态查询仍存在账号级语义。
- Stripe Webhook 没有可独立验证的工作区订单归属，不能依赖回跳用户或当前工作区推断充值目标。
- `task_usage.credit_micro` 是计量事实，不是钱包扣款凭证；记录用量不会自动使云端余额下降。
- 任务用量是累计覆盖式上报。若把每次上报都作为新增消费，会因重试和增量上报重复扣费。
- 负余额允许到什么程度、何时阻止任务、运行中任务如何处理尚无统一合同。

本功能把“计量事实”和“资金账本”分开：Aurocreator 负责可信计量与工作区归属，`iteamify-cloud` 负责钱包、不可变流水、Stripe 履约与余额准入。

## 2. 已确认决策

| 决策项 | 第一版结论 |
| --- | --- |
| 积分归属 | 工作区 |
| 付款人语义 | 用户只是付款人或操作人，不拥有积分 |
| 支付方式 | Stripe 一次性充值 |
| 消费方式 | 预付费，允许软负余额缓冲 |
| 免费积分 | 仅新建工作区一次性赠送 1000 积分，永不过期 |
| 存量免费积分 | 不补发 |
| 账号余额迁移 | 不处理；当前没有真实充值余额 |
| 定价 | 一个全局 Admin 配置的“每百万 token 对应积分”费率 |
| 差异化价格 | 不做模型倍率、客户折扣、阶梯、峰谷、Agent 或 MCP 单独定价 |
| BYOK | 不考虑 |
| 充值权限 | Workspace Owner/Admin |
| 账单权限 | Owner/Admin 看完整账单；成员只看用量和余额 |
| 负余额 | 全局 Admin 配置软下限；已运行任务允许结束 |
| 工作区删除 | 钱包和账本保留，停止消费；退款或迁移仅平台 Admin 操作 |
| 钱包权威 | `iteamify-cloud`，Aurocreator 不建立第二个余额账本 |

## 3. Goals

- 充值、赠送、消费、退款、调整都明确且不可变地归属于一个工作区。
- 同一个用户在多个工作区之间切换时，余额、账单、订单和缓存不串租户。
- Stripe 重试、Webhook 重放、回跳重复刷新最多履约一次。
- 同一任务用量重复或增量上报时只扣应付差额，不重复扣款。
- 钱包余额能在正常结算延迟内随 Agent 用量下降，并可从计量事实重建和对账。
- 负余额缓冲不强制中断运行中的任务，也不会允许无限启动新任务。
- 热路径只做常数次索引查询和必要的原子更新，避免 N+1、全表聚合与逐 token 写账。

## 4. Non-goals

第一版不做：

- 用户个人钱包或账号级余额。
- 订阅、自动充值、按月账单、授信或后付费。
- 工作区自助转账、共享余额池、成员消费额度。
- 积分有效期、批次过期、先进先出消费策略。
- 模型倍率、客户折扣、阶梯定价、峰谷价格。
- Agent、MCP 工具调用、缓存 token 的单独价格。
- BYOK 工作区。
- 任务级积分预冻结、释放与复杂预授权。
- 用户自助退款；第一版由平台 Admin 处理并保留流水。
- Aurocreator 与 `iteamify-cloud` 双写余额或维护双账本。

## 5. 核心领域模型与不变量

### 5.1 所有权

```text
User ──pays/acts──> Top-up Order ──credits──> Workspace Wallet
Task ──belongs to──> Workspace ──owns───────> Usage Charge
```

强制不变量：

1. 每个钱包只有一个 `workspace_id`，一个工作区最多一个钱包。
2. 每笔账本交易、充值订单、试用发放和用量结算都有不可变 `workspace_id`。
3. `payer_user_id`、`actor_user_id` 只用于付款、权限和审计，不能替代 `workspace_id`。
4. 请求体或 Stripe metadata 中的 `workspace_id` 不能单独作为授权依据。
5. Aurocreator 从受信任务关系解析用量所属工作区，不能接受 daemon 自由指定其他工作区。
6. 钱包余额只能通过账本服务的原子操作改变；后台调整也生成流水，禁止直接改余额。

### 5.2 金额精度

- 积分统一以 `credit_micro BIGINT` 存储：`1 credit = 1,000,000 credit_micro`。
- Stripe 金额使用币种最小单位整数，美元为 `amount_cents BIGINT`。
- 费率以整数版本化存储，不使用浮点数参与计费。
- UI 仅负责格式化，不能成为账务计算来源。

### 5.3 钱包与不可变账本（iteamify-cloud）

逻辑实体：

```text
workspace_wallet
  workspace_id               UNIQUE
  balance_credit_micro
  version
  created_at / updated_at

workspace_credit_transaction
  id
  workspace_id
  amount_credit_micro         signed
  balance_after_credit_micro
  kind                        trial_grant | topup | usage | refund | adjustment
  idempotency_key             UNIQUE
  reference_type / reference_id
  actor_user_id               nullable
  metadata                    bounded JSON
  created_at
```

第一版没有积分过期，不新增通用批次分配器。若云端已有 batch 表，仅作为现有账务实现细节保留，不让 Aurocreator 依赖批次消费语义。

### 5.4 充值订单（iteamify-cloud）

```text
workspace_topup_order
  id
  workspace_id               immutable
  payer_user_id
  currency
  amount_minor
  granted_credit_micro
  rate_version               immutable snapshot
  status                     pending | paid | fulfilled | failed | refunded
  stripe_checkout_session_id UNIQUE nullable
  stripe_payment_intent_id   UNIQUE nullable
  idempotency_key            UNIQUE
  created_at / paid_at / fulfilled_at / refunded_at
```

订单创建时固化付款金额、应发积分和费率版本。后台后续改价不得改变已有订单。

### 5.5 累计用量结算（iteamify-cloud）

```text
workspace_usage_settlement
  workspace_id
  usage_key                  UNIQUE with workspace_id
  settled_credit_micro       cumulative
  source_updated_at
  transaction_revision
  updated_at
```

`usage_key` 使用稳定的业务身份，例如：

```text
task:{task_id}:provider:{provider}:model:{model}
```

每次请求提交“截至目前累计应消费积分”，而不是本次新增积分：

```text
delta = requested_cumulative_credit_micro - settled_credit_micro
```

- `delta > 0`：原子新增 usage 流水并扣减余额。
- `delta = 0`：直接返回已有结果，不新增流水。
- `delta < 0`：只允许受信修正路径生成 adjustment 流水；普通上报返回冲突并进入人工/对账处理，避免被攻击性降量退款。
- 同一个结算 key 的并发请求通过行锁或 compare-and-swap 串行化。

## 6. 关键流程

### F1：新工作区获得免费积分

1. 工作区创建事务成功。
2. Aurocreator 写入可靠的云端操作出口，操作键为 `workspace_trial:{workspace_id}`。
3. Worker 调用 `iteamify-cloud` 创建钱包并发放 `1000 * 1,000,000 credit_micro`。
4. 云端以幂等键保证任意重试只发放一次。
5. 发放失败不删除工作区；状态持续重试并在管理端可观测。
6. 存量工作区不扫描、不补发。

### F2：Owner/Admin 一次性充值

1. 用户从明确的工作区账单入口选择充值金额。
2. Aurocreator 验证当前用户是该工作区 Owner/Admin。
3. Aurocreator 以受信 `X-Workspace-ID` 调用云端创建充值订单。
4. 云端按当前全局兑换配置计算积分并固化订单快照。
5. 云端创建 Stripe Checkout Session；Stripe metadata 包含订单 ID，工作区 ID只用于交叉校验。
6. 浏览器跳转 Stripe；返回页仅轮询该工作区订单状态。
7. Webhook 按 Stripe Session/PaymentIntent 查找已存在订单，校验金额、币种与 metadata 后调用同一幂等履约函数。
8. 履约事务原子写入 topup 流水、更新余额并标记订单 `fulfilled`。
9. Webhook 重放或页面重复刷新返回同一结果，不重复发放积分。

### F3：任务用量结算

1. Daemon 上报累计 token 计数。
2. Aurocreator 从 task/agent 的受信关系解析 `workspace_id`。
3. 使用任务开始时固化的全局费率快照计算累计 `credit_micro`。
4. 本地 `task_usage` 累计事实和结算出口在同一数据库事务内更新。
5. Worker 合并同一 `usage_key` 的未发送更新，只发送最新累计值。
6. 云端在事务中计算 delta、写入账本并更新钱包。
7. 成功后 Aurocreator 标记该累计版本已确认；超时使用同一幂等身份重试。

### F4：负余额准入

1. 新任务进入可认领/可启动状态前，服务端查询工作区钱包准入结果。
2. 当 `balance_credit_micro > negative_limit_credit_micro` 时允许启动。
3. 当余额等于或低于下限时拒绝启动新的付费任务，并返回稳定业务错误。
4. 已经启动的任务继续执行、上报和结算，最终余额允许略低于软下限。
5. 充值使余额重新高于下限后，任务启动能力自动恢复。
6. 钱包服务不可用时，新付费任务 fail closed；已运行任务不被中断，结算出口继续重试。

### F5：退款与工作区删除

- Stripe 退款事件关联原充值订单，在原工作区生成 refund 负向流水；不把积分退给付款人的个人账户。
- 若已消费导致余额进入负数，按相同软下限规则阻止新任务。
- 删除工作区时停止充值和新消费，但钱包、订单、结算及账本作为审计记录保留。
- 余额迁移、退款或人工修正仅平台 Admin 可执行，且必须生成 adjustment/refund 流水。

## 7. 权限合同

| 能力 | Member | Admin | Owner | Platform Admin |
| --- | ---: | ---: | ---: | ---: |
| 查看 Usage 汇总 | 是 | 是 | 是 | 按管理权限 |
| 查看工作区剩余积分 | 是 | 是 | 是 | 按管理权限 |
| 查看充值订单与完整账本 | 否 | 是 | 是 | 是 |
| 创建 Checkout | 否 | 是 | 是 | 否，除非模拟该工作区授权流程 |
| 修改全局积分费率 | 否 | 否 | 否 | 是 |
| 修改全局负余额下限 | 否 | 否 | 否 | 是 |
| 人工调整、退款或迁移 | 否 | 否 | 否 | 是 |

所有工作区账务 API 必须先通过成员或角色校验，再由服务端写入受信工作区头；禁止把浏览器提交的任意工作区 ID直接透传给云端。

## 8. API 合同

### 8.1 Aurocreator 面向客户端

所有 endpoint 都位于工作区权限边界内，具体路由命名遵循现有 router 约定：

- 获取工作区余额与准入状态。
- Owner/Admin 获取工作区交易流水。
- Owner/Admin 获取工作区充值订单。
- Owner/Admin 创建充值 Checkout。
- Owner/Admin 查询 Checkout/订单状态。

响应必须包含 `workspace_id`。前端使用 zod 与 `parseWithFallback` 解析；解析后仍校验返回 `workspace_id` 等于当前路由工作区。

### 8.2 Aurocreator 调用 iteamify-cloud

- 所有用户态账务请求都带服务端认证和受信工作区身份。
- 试用发放与用量结算使用服务间身份，不模拟用户。
- Checkout 创建请求同时携带工作区、付款用户和请求幂等键。
- Webhook 保持公开签名入口，由云端验证 Stripe 签名；不能要求用户会话。

### 8.3 错误语义

- `403`：不是成员或角色不足。
- `404`：订单/交易不属于该工作区时统一隐藏资源存在性。
- `409`：重复业务状态冲突、累计用量倒退或订单状态不允许。
- `422`：充值金额、币种或配置无效。
- `503`：钱包准入暂不可用；新任务不得启动。

## 9. 性能设计

### 9.1 写路径

- 不按单个 token、事件或流式 chunk 写账；按 `(task, provider, model)` 累计聚合。
- Aurocreator 出口对同一 `usage_key` 合并未发送版本，只保留最新累计值，降低网络和云端写放大。
- 云端 `delta=0` 走无流水快速返回。
- 钱包余额在写账事务中增量维护；读取余额禁止每次 `SUM(ledger)`。
- 钱包行只在单工作区扣费事务内加短锁，不使用全局锁。
- Stripe Webhook 快速完成校验与幂等履约，不同步执行通知、邮件或昂贵聚合。

### 9.2 读路径

- Usage 首页一次请求返回余额、负余额状态和必要展示字段，避免余额与准入两次往返。
- 流水、订单使用游标分页，不使用高 offset 分页。
- React Query 的所有账务 key 包含 `workspaceId`；余额成功结算或充值后只失效对应工作区 key。
- 不在前端轮询完整账本；Checkout 页面只轮询单个订单并退避。

### 9.3 必要索引

逻辑上至少需要：

- 钱包：唯一 `workspace_id`。
- 流水：唯一 `idempotency_key`；`(workspace_id, created_at DESC, id DESC)` 分页索引。
- 订单：唯一 Stripe Session ID、PaymentIntent ID、idempotency key；工作区订单分页索引。
- 用量结算：唯一 `(workspace_id, usage_key)`。
- Aurocreator 出口：待处理状态加下一次重试时间索引；同一 aggregate key 唯一活跃记录。

若索引落在本仓库 PostgreSQL，必须各自使用单独迁移文件和 `CREATE [UNIQUE] INDEX CONCURRENTLY`，不得新增外键。

## 10. 可靠性与安全

- Stripe Webhook 必须验证签名，并使用原始请求体。
- Webhook 信任数据库中已固化订单；metadata 仅交叉校验，不能创建任意工作区充值。
- Checkout 成功回跳不直接发积分。
- 所有状态变更具有幂等键；网络超时后的重试不得生成重复流水。
- 日志不得记录 Stripe secret、Webhook secret、完整支付载荷或服务间凭证。
- 管理员全局费率和负余额配置变化写入审计记录。
- 费率更新使用版本号；任务与充值订单分别固化其创建时版本。
- 定期对账 Stripe 已支付订单与 fulfilled 流水、Aurocreator 累计用量与云端 settled 值。
- 告警至少覆盖：结算积压、连续重试、Webhook 签名失败激增、支付已成功但未履约、钱包余额异常跳变。

## 11. 用户体验

### 11.1 Usage

- 主指标：`积分消耗 · 30 天`。
- 数值固定两位小数，小数部分视觉弱化，不在数值尾部重复显示“积分”。
- 下方小号文本显示当前工作区剩余积分。
- 成员能看到用量和余额，但不能通过 UI 或直接 API 读取付款信息。
- 负余额达到限制时显示明确的“工作区积分不足”，Owner/Admin 获得充值入口。

### 11.2 付费入口

- 入口位于工作区 Billing/Usage 上下文，不能是脱离工作区的账号充值页。
- 普通成员看到“联系工作区管理员充值”；Owner/Admin 看到“充值积分”。
- Checkout 前明确显示目标工作区、付款美元金额和到账积分。
- 支付返回后展示 `处理中 / 已到账 / 失败`，不以 Stripe 回跳参数自行判断成功。

## 12. 实施边界与顺序

### Phase 1：云端工作区钱包合同

- 工作区钱包、不可变流水、充值订单、用量累计结算。
- Stripe Checkout、Webhook 幂等履约、退款事件和对账。
- 全局费率与负余额下限配置。

### Phase 2：Aurocreator 全面工作区化

- 所有余额、流水、订单、Checkout 与状态查询移入工作区授权边界。
- 类型、zod schema、API client 和 React Query key 全部包含工作区身份。
- 去除账号级账务读取和不带工作区的旧路径；产品未正式产生余额，不做兼容双读。

### Phase 3：用量可靠结算与准入

- 在用量事务中写入合并型结算出口。
- Worker 推送累计值、重试、退避、死信可观测与人工重放。
- 新任务启动前执行工作区余额软下限检查。
- 已运行任务不中断，结算持续重试。

### Phase 4：免费积分与付费 UI

- 仅新建工作区写入试用发放出口。
- Owner/Admin 充值入口、订单状态和账单页面。
- Member 只读余额/用量体验。
- Usage 展示与余额刷新闭环。

不能先上线真实 Stripe 充值，再补工作区订单归属或幂等账本。Phase 1–3 是资金正确性的发布前置条件。

## 13. User Stories / Acceptance Criteria

### US-001：工作区账务授权闭包

**Description:** 作为工作区成员，我只能访问当前工作区允许我查看的积分信息。

- [ ] 所有余额、流水、订单、Checkout 和状态接口显式解析工作区。
- [ ] Member 只能读取余额与用量；Owner/Admin 才能读取账单并充值。
- [ ] 跨工作区 ID、订单 ID 和 Checkout ID访问返回 404/403，不泄漏数据。
- [ ] 前端所有账务 Query Key 包含 `workspaceId`。
- [ ] API 响应 schema 包含并验证 `workspace_id`，有畸形和错工作区响应测试。

### US-002：新工作区一次性免费积分

**Description:** 作为新工作区，我获得一次永久有效的 1000 积分试用额度。

- [ ] 仅功能上线后新建工作区触发发放；不扫描存量工作区。
- [ ] 发放幂等键为 `workspace_trial:{workspace_id}` 或等价稳定键。
- [ ] 创建重试、Worker 重试与并发最多产生一条 trial 流水。
- [ ] 失败可重试且可观测，不回滚已成功创建的工作区。
- [ ] 积分无过期时间。

### US-003：Stripe 工作区充值

**Description:** 作为 Owner/Admin，我可以给当前工作区一次性充值积分。

- [ ] Checkout 创建前验证工作区角色。
- [ ] 订单固化工作区、付款人、金额、积分和费率版本。
- [ ] 页面显示充值目标工作区，不能在支付回跳时切换归属。
- [ ] Webhook 验签、校验订单金额与币种，并幂等履约。
- [ ] Webhook 重放、Checkout 重复刷新和并发处理最多发放一次。
- [ ] 支付成功回跳本身不增加积分。

### US-004：累计用量幂等扣费

**Description:** 作为工作区，我只为实际累计 token 用量支付一次积分。

- [ ] 工作区从受信 task 关系解析，不信任 daemon 自报工作区。
- [ ] 同一累计值上报 100 次只产生一次等额消费结果。
- [ ] 累计值从 A 增长到 B，只新增 `B-A` 的消费。
- [ ] 两个并发增量请求不会重复扣款或丢失增量。
- [ ] Aurocreator 本地提交后进程崩溃，重启仍能完成云端结算。
- [ ] 云端已扣费但客户端超时，重试返回同一结果且不重复扣费。
- [ ] 普通上报出现累计值倒退时不自动退款，并产生可观测冲突。

### US-005：统一费率快照

**Description:** 作为平台 Admin，我用一个全局费率控制所有 token 的积分价格，同时历史任务保持稳定。

- [ ] 输入、输出、缓存读写 token 使用同一个费率。
- [ ] 模型、Agent、客户和 MCP 不改变费率。
- [ ] 任务开始时固化费率版本；运行中改价不追溯任务。
- [ ] 充值订单创建时固化兑换率版本；支付完成时不按新价格重算。
- [ ] 费率修改具有审计记录和边界校验。

### US-006：软负余额缓冲

**Description:** 作为工作区，我的运行任务不会因余额临界被粗暴中断，但不能无限启动新任务。

- [ ] Admin 配置一个全平台负余额下限。
- [ ] 高于下限允许新任务；等于或低于下限拒绝新任务。
- [ ] 已运行任务完成后仍可靠结算，余额可短暂低于下限。
- [ ] 充值恢复余额后无需人工解锁。
- [ ] 钱包服务不可用时新任务 fail closed，已运行任务不终止。

### US-007：退款、删除与审计

**Description:** 作为平台运营者，我能追溯退款和删除工作区后的资金变化。

- [ ] 退款关联原订单和原工作区，以不可变流水冲减余额。
- [ ] 删除工作区后禁止充值和新消费，但账本、订单和结算记录保留。
- [ ] 人工退款、调整或迁移仅 Platform Admin 可执行。
- [ ] 每次人工操作记录 actor、原因、reference 和 balance after。
- [ ] 不提供直接修改 wallet balance 的管理接口。

### US-008：性能与运行稳定性

**Description:** 作为平台，我希望计费不会显著拖慢任务上报和 Usage 页面。

- [ ] token 流式事件不逐条写账，同一 usage key 的待发送版本可合并。
- [ ] 余额读取不聚合全量账本。
- [ ] 流水与订单使用游标分页和工作区前缀索引。
- [ ] 负余额检查和单次用量结算均为常数次索引查询。
- [ ] 压测覆盖一个高并发工作区与大量独立工作区，钱包行锁不扩散成全局锁。
- [ ] 结算异步执行，不把云端网络延迟加入 daemon 用量上报响应时间。

## 14. 测试与验收

### 14.1 必测场景

- 工作区 A 的 Owner、Admin、Member 与工作区 B 成员的权限矩阵。
- 用户在两个工作区快速切换，无缓存串余额、串订单或串流水。
- 工作区创建、请求超时、Worker 重启、并发免费发放。
- Checkout 创建重试、Webhook 重放、乱序、延迟与签名失败。
- 用量重复、增量、并发、超时重试、进程崩溃恢复和倒退冲突。
- 余额恰好高于、等于、低于负余额下限时的任务准入。
- 运行任务跨越负余额下限后完成并结算。
- Stripe 退款后余额为正、为负以及低于软下限。
- 工作区删除后历史可审计但所有新写入被拒绝。

### 14.2 发布验收层级

1. 本地单元、并发、handler、schema 与前端测试通过。
2. 测试环境 Stripe test mode 完成真实 Checkout 与签名 Webhook。
3. 数据库验证订单、流水、钱包余额和用量 settlement 可相互对账。
4. 浏览器验收 Owner/Admin/Member 三种角色与跨工作区切换。
5. 发布后以小额真实支付 canary 验证支付、履约、余额和 Usage 展示。
6. 单独观察结算积压、错误率和钱包服务延迟，再扩大流量。

本地测试通过不能替代 Stripe、云端钱包、生产数据库和浏览器的分层验收。

## 15. Success Metrics

- 重复履约或重复扣款：0。
- 跨工作区账务数据泄漏：0。
- 已支付但在对账窗口后仍未到账的订单：0。
- 用量事实与云端 settled 累计值差异超过阈值的工作区：0。
- 正常情况下用量结算 P95 延迟不超过 60 秒。
- 余额读取 P95 不因账本历史增长而线性恶化。
- 结算请求中 `delta=0` 不新增流水，重试写放大受控。

## 16. Open Configuration Values

以下不是产品方向问题，但实施前必须由运营给出初始值：

- 每百万 token 对应的积分数。
- 一美元对应的充值积分数或等价兑换配置。
- 全局负余额下限。
- 允许的单笔最低、最高充值金额。
- 结算重试退避、告警积压时长和 Stripe 对账窗口。

这些值由 Admin 配置，不改变本 PRD 的工作区所有权、统一费率和幂等账务合同。
