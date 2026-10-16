# Reddit 第一版：按需读取与人工确认回复

状态：代码已实现；本地验证记录见下。真实 Reddit 授权、生产迁移和公开发送尚未执行。

本文件取代原方案的 S1–S5 实施顺序，作为本次第一版的范围与验收说明。

## 范围与用户流程

Web 与 Desktop 共用 `/{slug}/connections/reddit`，也可在 Connections 页面内使用。

1. 管理员通过浏览器 OAuth 连接账号。初次请求 `identity read`；需要发送时，针对同一账号重新授权增加 `submit`。
2. 成员选择公开社区，读取最新帖子或按关键词搜索。可以分页、展开讨论、针对帖子或某条评论起草回复。
3. 用户或智能体保存完整草稿。草稿绑定连接、真实目标 fullname、目标内容版本及草稿版本。
4. 管理员审阅实际发送账号、回复目标和完整正文，点击“确认并发送”。服务端重新读取目标并原子入队。
5. scheduler 每 30 秒领取一个发送任务。只有有效 Reddit 评论回执才能标记已发送；展示真实评论链接。
6. 发送结果未知时不自动重试。管理员在 Reddit 找到评论，输入 t1_ ID，服务端核对作者、父目标、正文和时间后确认回执。

第一版不包含持续社区监控、私信、Reddit Chat、主帖发布、自动回复、CRM 导入、全历史抓取和无限展开评论。

## 实现边界

- 原未接通的 script/password 安装及自动 channel 回复代码已移除。
- 独立 `reddit_connection` 区分应用和账号：同一 OAuth app 可连接多个工作区账号；连接按工作区隔离。
- 服务端不建立帖子/评论快照库；按需读取响应带 `Cache-Control: no-store`。客户端使用 React Query，读取缓存不持久化、卸载即回收。
- subreddit 类型必须为 public，拒绝 private/restricted、quarantine 和 NSFW。首版读取上限：搜索 50 帖；讨论 100 条评论预算，最多另含根帖，显式返回 partial。
- 评论回复使用 `POST /api/comment` 的 `api_type=json`、`thing_id`、`text`。不拆分长评论，正文上限 9500 Unicode code points。
- `pending → queued → sending → sent / failed / unknown`。取消只适用于尚未发送的草稿/队列或明确失败；unknown 不开放重发入口。
- 草稿版本控制、连接行锁和任务领取防止并发审批/worker 重复发送；并不声称 Reddit 侧 exactly-once。
- 正常限流可延后任务；连接中断、无效或缺失回执进入 unknown。发送 lease 超时也进入 unknown，不重新领取。
- 所有节点共享数据库请求预算，按 OAuth client ID 预占额度并用响应头校准。每个连接最多批准 10 条/小时；相同账号连接、目标和正文的在途/已发/未知草稿不可重复批准。
- 发送前核对管理员仍在工作区且仍具权限、连接可回复、草稿未过期、目标未变化或锁定。
- 48 小时后删除整条草稿和关联发送记录。断开连接清除本地 token 与该连接草稿。检测到明确删除标记时清理相关草稿；后台每 5 分钟检查最多 5 个超过 6 小时未检查的目标，另有每 30 秒过期清理。
- 原始请求正文、OAuth token、Reddit 响应正文不进入该集成的错误日志。审计采用 scheduler 执行记录及草稿在保留期内的状态。

## 部署配置

使用获批的 Reddit Web app，并注册与配置完全一致的回调 URL：

| 环境变量 | 说明 |
|---|---|
| `ITEAMIFY_REDDIT_API_APPROVED=true` | 部署方确认实际用途已获 Reddit 许可后开启；不是自动获得许可 |
| `ITEAMIFY_REDDIT_CLIENT_ID` | 获批 Web app ID |
| `ITEAMIFY_REDDIT_CLIENT_SECRET` | Web app secret，仅服务端保存 |
| `ITEAMIFY_REDDIT_CALLBACK_URL` | `https://<API域名>/api/integrations/reddit/callback` |
| `ITEAMIFY_REDDIT_USER_AGENT` | 可识别的应用 User-Agent，如 `web:auro:1.0 (by /u/<维护账号>)` |
| `ITEAMIFY_REDDIT_SECRET_KEY` | secretbox 支持的稳定 32 字节密钥编码，遵循现有 secretbox 配置方式 |

迁移 593–601 创建连接、一次性 OAuth state、草稿/发送任务、共享预算及独立并发索引。无外键或级联。实施时核对分支最新迁移号；不要修改已经发布的迁移。

许可申请需要涵盖公开社区读取、AI 辅助分析及人工确认的评论回复。集成自身的 48 小时清理不代表已有任务日志、聊天历史、备份或外部模型服务自动获得相同保留期；实际部署启用前应根据获批的数据用途与保留要求验证这些系统。第一版不复制原文到 CRM 或知识库，内置技能也禁止将 Reddit 原文另存文件或记忆。

断开连接代表 Auro 停止使用并删除本地凭证；如需撤销 Reddit 账户侧对应用的授权，可在 Reddit 的授权应用设置中移除。

## 智能体命令

```sh
iteamify reddit connections
iteamify reddit search --connection <uuid> --sub SaaS --query "looking for"
iteamify reddit thread t3_example --connection <uuid> --limit 50
iteamify reddit draft t1_example --connection <uuid> --content-version <版本> --body-file /tmp/reply.txt
iteamify reddit drafts
```

内置 `iteamify-reddit` 技能随正常任务技能包分发；没有 agent approve/send 命令。任务 token 按 token 的 task→agent→workspace 验证；人工审批使用现有 RequireHumanActor 加管理员校验。前端所有服务器状态属于 React Query。

## 本地验证

- PostgreSQL 17 临时实例，仅 Unix socket，不使用现有开发或生产数据库。
- 在独立 schema 中实际执行 593–601，并验证 OAuth state 一次性消费、失权后拒绝连接、跨工作区隔离、旧版本审批拒绝、并发审批/领取仅发送一次。
- HTTP transport 替身验证 refresh、401 请求体重建、200 内错误、错误/缺失回执、429、未知发送后不重试、真实评论 ID 核验及 source 变化阻断。
- 前端测试验证畸形 API 响应降级、OAuth URL 限定、工作区请求头、明确点击才提交审批、目标变化禁用发送、成员不出现审批入口和 unknown 仅核验。
- `pnpm typecheck` 覆盖 core/views/Web/Desktop。

独立数据库测试命令：

```sh
cd server
REDDIT_TEST_DATABASE_URL='<一次性本地 PostgreSQL DSN>' go test ./internal/integrations/reddit -count=1 -v
```

未设置上述测试变量时数据库用例会跳过；这不构成数据库验收。实际 Reddit OAuth 与公开发言必须使用获批应用、真实配置，并由用户确认具体发言后单独验收。
