# 本地工作区积分：部署与验收

本实现为 Aurocreator Go 后端内的 Billing 模块，共用现有 PostgreSQL。Stripe 只收款，不保存积分余额；`iteamify-cloud` 不再参与充值、扣款、余额读取或任务准入。运行时 Fleet 的其他功能不在本次删除范围。

## 配置

生产密钥统一放在现有 `/etc/aurocreator/backend.env`，无需新服务、新配置文件或前端公钥：

```dotenv
STRIPE_SECRET_KEY=sk_test_REPLACE_ON_SERVER
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ON_SERVER
ITEAMIFY_APP_URL=https://YOUR_APPLICATION_HOST
```

通过服务器安全编辑器填写实际值，不要提交仓库、发到聊天或输出环境变量。文件限定 root 所有、0600，systemd 通过现有 EnvironmentFile 加载。服务账号如需直接读取，应使用严格限定的组权限，不要开放世界可读。主机 root 与后端进程仍可获取这些密钥，这是单体部署的信任边界。

两项 Stripe 密钥均为空时，充值关闭，但本地余额、试用积分与消费记账继续工作。只配置一项、无效前缀或 live 模式非 HTTPS 会令后端启动失败。Hosted Checkout 不需要 `pk_*`。测试和正式环境分别配置自己的签名密钥，不能混用。

在 Stripe 注册公开 HTTPS 端点 `https://YOUR_APPLICATION_HOST/api/webhooks/stripe`，订阅 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.expired`。反向代理必须将原始请求体和 Stripe-Signature 传给后端。不要给这个端点加登录跳转。

统一积分兑换比例、允许充值金额和透支下限存储在计费数据库配置中。管理页面已移除；未配置充值比例与金额时充值关闭。

## 切换顺序

1. 备份数据库，暂停旧版本的新任务与充值入口，确认不再有旧计费 worker 运行。不要混跑新旧后端版本。
2. 只读检查旧 `workspace_credit_operation` 的待投递记录以及 Cloud 是否存在尚未履约的付款。本次不自动迁移旧余额或补发旧试用积分；发现真实已付款订单须先人工核对，不能直接丢弃。
3. 执行标准部署迁移（507–517），再启动新版本。已有钱包初始化为零；此前已经运行的任务不会补扣，新版本成功开始的任务才启用本地结算。旧 outbox 表保留供审计，不再读取或发送。
4. 先用 Stripe 测试模式完成下述验收；正式开通时替换为服务器上的 live 密钥及对应 webhook secret，重启并确认配置生效。不得把一次本地测试等同于真实 Stripe 或生产验收。
5. 开放任务与充值。充值后不能直接回滚到旧 Cloud 计费版本，否则会重新分裂账本；出现问题先暂停充值，保留数据库并向前修复。

## 运维与异常恢复

- 用户入口为 `/{workspaceSlug}/billing`。Owner/Admin 可充值、查订单和流水；普通成员可看余额和 Usage。旧 `/api/cloud-billing/*` 路径仅兼容名称，实际全部在本地处理；Portal 与积分批次接口返回 410。
- 订单保存金额、兑换比例、工作区和付款人快照；成功页只查询本地状态，绝不凭回跳 URL 加积分。Webhook 使用事务履约，订单只能充值一次。
- 管理后台、人工对账和积分调整接口已删除。退款不会自动冲减积分；异常付款由运营核查 Stripe 与本地账本后处置。
- 积分以整数 micro 存储（1 积分 = 1,000,000 micro），美元以 cents 存储。余额是单行读取；流水/订单按工作区索引游标分页；扣款与流水同事务。运行中的任务可继续形成负余额，配置下限是停止新任务的软门槛，不是并发欠费硬上限。
- Usage 顶部积分消耗来自所选期间的真实消费流水；历史任务的 Token 计量仍保留，不会因切换而补扣。模型成本分析不作为钱包真相。

## 验收清单

- 新建工作区只赠送一次 1000；存量不补赠；成员与跨工作区权限隔离。
- 同订单回调 100 次只产生一笔充值；签名、金额、币种、模式、订单归属不匹配不入账。
- 累计用量重复不扣、增加只扣差额、陈旧报告不回退；账本写入失败时余额回滚。
- 达到软下限不能开始新任务；已开始任务继续计费；任务开始时快照费率，后续改价不影响它。
- Stripe 测试支付、取消、创建请求超时后的核对、重复回调、回跳页面到账状态；再进行正式环境小额付款验收。

隔离测试库可通过 `BILLING_TEST_DATABASE_URL` 运行 service 本地账务集成测试，通过 `DATABASE_URL` 运行 handler 集成测试。切勿把测试指向生产库。

## 本次本地验证记录（2026-09-03）

- 全部迁移已在独立 PostgreSQL 17 测试库应用；未访问生产数据库。
- service 与 cmd/server 全量测试通过；计费 handler 定向集成测试通过，包括 100 次并发履约、100 次累计报告重放、补账、余额门槛、历史任务免追扣。
- 完整 handler 回归仍有两项既有失败：`TestDashboardUsageDailyBucketsByViewerTimezone`、`TestBootstrapOnboardingNoRuntimeUsesChineseGuideForChineseUsers`。未修改的 HEAD 快照在同一隔离测试环境复现相同失败。
- Core API 69 项、Usage 页面 18 项单元测试通过；Core、Views、Web 类型检查通过。
- 尚未进行浏览器视觉验收、真实 Stripe 测试支付或生产部署。这些不能用 SDK 模拟测试替代。

## Billing 页面优化验证（2026-09-04）

- Billing 页面已改为正式工作区积分页面：共享余额、统一面额选择、单一 Stripe 支付动作和合并式账务记录；没有套餐等级、充值奖励或权益差异。
- 支付回跳使用业务状态提示，最长自动轮询 60 秒；超时后允许重新查询，并提醒不要重复付款。Session ID 不再直接展示给普通用户。
- Billing 页面状态测试覆盖 Owner/Admin 购买、成员只读、负余额、统一面额选择；Core API、Usage 页面与 Billing 页面相关测试通过，Web、Desktop、Core、Views 类型检查通过。
- 使用隔离 PostgreSQL 重新运行账务业务集成测试通过，未访问生产数据库。浏览器已验证本地应用能够启动并进入登录流程；受本地未配置 Stripe 测试密钥限制，真实 Hosted Checkout 支付和到账仍是部署前必做验收项。
