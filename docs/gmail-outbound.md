# Gmail 客户邮件

会话里的 `outbound_email` 是唯一发件记录，也承担持久化发送队列。客户详情页读取同一条记录。
现有 Gmail Service 管理凭证、收件和发件；没有新增服务、Redis、Google 草稿权限或历史账号迁移。

- 新连接请求 `gmail.readonly` 和 `gmail.send`，OAuth 回调验证两项实际授权后才保存连接。
- 助手通过现有资源工具查询 `gmail_connection`、创建/更新 `outbound_email` 草稿。
- 人在会话卡片查看发件人、To/Cc/Bcc、主题、纯文本正文、附件，点击一次“发送”。
- 发送接口只接受邮件 ID 和所查看的版本号，拒绝 task token/cloud PAT；资源工具没有发送动作。
- 只有 `draft` 可以更新，更新使版本递增。排队时原子冻结版本，重复请求返回同一条记录。
- `queued → sending → sent / failed / unknown`。Gmail 返回消息 ID 才记录 `sent`，不推断送达或已读。
- 明确限流最多尝试三次，带退避、随机抖动及 Retry-After。发送超时、5xx、丢失响应、进程崩溃进入 `unknown`，不自动重发。
- 每个进程一个 worker，数据库 `SKIP LOCKED` 支持多副本；两分钟租约，单次处理截止时间 90 秒。凭证、成员和会话锁协调删除与发送。
- 附件只接受当前会话或本人未绑定上传的 ID，保存对象引用和元数据，最多 10 个、合计 18 MiB；MIME 最多 25 MiB。系统不会抓取任意外部 URL。
- 断开 Gmail、删除会话/工作区、移除成员及运行环境清理会同步移除相关记录。Gmail 本身已发送的邮件不受本地清理影响。
- 该版本发送新邮件，不提供 Gmail 收件箱线程内回复、群发活动、送达回执或自动重试不确定结果。

## 上线

1. 在与生产 OAuth Client 相同的 Google 项目中确认两项 scope 已获准，发布状态为生产；保持现有回调地址和凭证加密密钥。
2. 执行迁移 550–556，再发布 Go 后端及共享前端。无需新增环境变量。
3. 用户自行删除旧连接并重新授权。Connections 显示“可发送邮件”后，在会话生成草稿。
4. 使用明确获准的测试收件人进行一次真实投递，并分别检查本地 `sent`/Gmail 消息 ID、Gmail 已发送、收件方实际收件。本地模拟测试不替代这一步。

## 本地验证

`GMAIL_TEST_DATABASE_URL` 只用于已迁移的隔离测试数据库，不回退到正常 `DATABASE_URL`。

```sh
cd server
GMAIL_TEST_DATABASE_URL="$DISPOSABLE_TEST_DATABASE_URL" go test ./internal/integrations/gmail -run TestOutbound -count=1
DATABASE_URL="$DISPOSABLE_TEST_DATABASE_URL" go test ./internal/handler -run 'TestOutboundEmail|TestAssistantResource|TestRequireHumanActor' -count=1
```

Google 契约：[发送 MIME 邮件](https://developers.google.com/workspace/gmail/api/guides/sending)、[错误分类](https://developers.google.com/workspace/gmail/api/guides/handle-errors)、[OAuth 授权与范围](https://developers.google.com/identity/protocols/oauth2/web-server)。
