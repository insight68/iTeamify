# Reddit 社区内容抓取与写回 完整方案

> 状态：已评审，原始方案保留供参考。第一版范围、修正后的 OAuth/回复协议及验收说明见 [Reddit 第一版](./prd-reddit-community-ingestion-v1.md)。
> 前置结论：当前 Reddit 集成只是「适配器骨架」，端到端未接通（详见 §1）。
> 目标：能按工作区监控指定 subreddit、抓取社区帖子与评论、让智能体按需读取，并且在人工确认的前提下把内容写回 Reddit。

---

## 1. 起点：现状盘点

代码集中在 `server/internal/integrations/reddit/`（7 个 go 文件，**零 `_test.go`**，最后修改 2026-09-13）。

### 1.1 已经写好但断链的部分

| 环节 | 文件 | 状态 |
|---|---|---|
| BYO script-app 安装 | `byo_install.go` | 可用。`grant_type=password` → `/api/v1/access_token` 换 refresh_token → `/api/v1/me` 校验 → secretbox 加密落 `channel_installation.config` |
| 提及 / 私信轮询 | `inbound.go` | 代码完整：30s 轮询 `/message/unread` + `/message/inbox`，翻译 `t1`/`t4` |
| 评论回复 | `outbound.go` | 代码完整：`POST /api/comment`，9500 rune 分块，解析 Reddit 的「200 里带 errors」信封 |
| 能力声明 | `channel.go` | `CapText \| CapThreadReply` |

### 1.2 三个硬断点（不修就没有任何流量）

1. **`reddit` 从未注册 ResolverSet。** `server/cmd/server/router.go` 里 `channelRouter.Register(...)` 只对 Feishu（547 行）和 Slack（663 行）调用过。`engine.Router.Handle` 首件事是查 `r.sets[channelType]`，查不到即返回 `ErrNoResolverSet`。**每条轮询到的事件都被丢弃 + error 日志，会话建不起来，智能体永不运行。**
2. **没有 outbound 订阅者。** 对比 `slack.NewOutbound(...).Register(bus)`（664 行），Reddit 无对应实现，全仓搜不到 `reddit.NewOutbound`。`redditChannel.Send` 是死代码。
3. **UI 无入口。** `RedditAgentBindButton` 已在 `packages/views/connections/components/channels/reddit-connections.tsx` 定义并导出，但**全仓零挂载点**。目前只能直接调 `POST /api/workspaces/{id}/reddit/install/byo?agent_id=`。

### 1.3 另外四个待修缺陷

- **私信回复必然失败**：`translateDM` 把 `ChatID` 设成合成串 `dm_<bot>_<author>`，而 `pickParentID` 会拿它当 Reddit `parent` thing_id 去 POST `/api/comment`。私信必须走 `/api/compose`。
- **无 `scope` 参数**：安装换 token 时未传 scope，实际权限取决于 Reddit 给 script app 的默认值。抓社区内容**必须**显式带 `read`。
- **429 无处理**：`auth.go` 的 `do()` 只有 401 重试，没有 429 分支，也没读 `X-Ratelimit-*` 头。注释里写的「rate-limit-aware」与实现不符。
- **重复投递**：轮询用 `mark=none`，未读项永远 `new:true`，而 `deliver` 的过期过滤是 `itemTime.Before(cutoff) && !item.Data.New` → `new:true` 绕过 cutoff，**每 30 秒重复投递同一项**。目前靠 ResolverSet 的 Dedup 挡，而 reddit 恰好没注册 Dedup。

---

## 2. Reddit 平台侧的硬约束

这一节的数字全部以 Reddit 官方 Data API Wiki 为准，**其中限流与现有代码注释不一致**。

| 约束 | 事实 | 对本方案的影响 |
|---|---|---|
| 限流 | **100 QPM per OAuth client id**，按 10 分钟窗口取平均（允许突发） | 代码注释里的「60 QPM」已过期。**同一 app 的所有调用共享这个额度** |
| 限流头 | `X-Ratelimit-Used` / `-Remaining` / `-Reset` | 必须据此做预算，不能只靠"每 30s ≤ 6 次"的经验值 |
| listing 上限 | 单次 `limit` 最大 100；**任一 listing 最多只返回约 1000 条** | 要更多历史必须换 `search` + 时间窗切片 |
| 认证 | 必须 OAuth，未认证流量被直接封锁 | 不能用 `.json` 端点兜底 |
| User-Agent | 必须 `<platform>:<app ID>:<version> (by /u/<username>)`，通用 UA 会被限流/封禁 | 现有 BYO 表单已要求填 user_agent，需加格式校验 |
| scope | `identity` / `read` / `mysubreddits` / `submit` / `vote` / `privatemessages` / `edit` | 抓取至少 `read`；写回评论+发帖需 `submit`；私信需 `privatemessages` |
| 商用许可 | 免费层需申请访问并获批；**商业用途需单独签约** | **P0 阻塞项，见 §9** |

### 2.1 合规条款（最容易被忽略，但会决定数据模型）

Reddit Data API Terms 明确要求：

- 内容在 Reddit 上被删除后，**必须删除你这边存的对应内容**（标题、正文、内嵌 URL 一并删）。
- 账号被删除后，**必须删除所有作者身份信息**（`t2_*`、用户名、主页 URL、头像 URL、用户 flair），包括历史帖子/评论里的引用。
- **保留已删除的内容（即使已解除关联、去标识化或匿名化）同样违规。**
- 建议「定期在 48 小时内清理存储的用户数据与内容」。

→ 这直接推出两个设计要求：**(a) 内容必须可被硬删除（不能只做软删/匿名化）；(b) 必须有一个定期比对删除状态的 job**（§6.4）。数据表因此需要记录 `deleted_on_reddit_at` 与保留期。

---

## 3. 核心架构决策

### KTD-1：社区内容抓取**不复用** channel engine，另起一条「内容源」管线

不能把 subreddit 帖子塞进现有 `engine.Router`，理由是这条管线的语义就是错的：

- 它的前置是「外部人类向 bot 发话」，而社区帖子没有指向 bot。强行注入会在身份解析处被 `ErrSenderNotMember` 丢掉——帖子作者不是工作区成员。
- 每条帖子会建一个 chat_session、触发一次智能体运行 → 成本按帖子数爆炸。
- 它天然会驱动「在帖子里回复」→ 在没被提及的公开帖下发言是刷屏行为，真实封号风险。

**结论**：Reddit 目录下并存两半，共享底层 HTTP/加密设施，但管线互不干扰：

```
server/internal/integrations/reddit/
  auth.go config.go        ← 共用：oauthClient、secretbox 解密、installConfig
  byo_install.go install.go ← 共用：安装/吊销/列表
  channel.go inbound.go outbound.go  ← 半 A：提及/私信 → 智能体 → 回复（需接通）
  source.go ingest.go normalize.go   ← 半 B：subreddit 内容抓取（新增）
  ratelimit.go             ← 共用：按 client_id 的额度预算
  retention.go             ← 新增：合规删除同步
```

### KTD-2：抓取由 scheduler 驱动，不由轮询循环驱动

复用 `server/internal/scheduler`（`sys_cron_executions` 做分布式租约 + 审计）。**不要**把抓取塞进 `redditChannel.Connect` 的 30s 循环——那样会失去重试、超时、按源隔离与审计能力，且一次抓取失败会污染私信轮询。

- Job 名：`reddit_subreddit_ingest`（snake_case，稳定，不可改名）
- Cadence：5 分钟（`CatchUpLatestOnly`，handler 自带 watermark，不重放）
- Scope：**每条 `reddit_source` 一个 scope**（`ScopeKindRedditSource`，id = source UUID）→ 一个慢的 subreddit 不阻塞其他
- RunTimeout 60s / StaleTimeout 2min / HeartbeatInterval 30s / MaxAttempts 3 / 退避 30s,2m,5m
- handler 内**禁止 sleep 等额度**；额度不足就提前返回部分结果，留给下一个 plan

### KTD-3：限流预算按 `client_id` 共享

每次安装 = 一个 BYO Reddit app = 一个 `client_id`，**该额度在私信轮询与内容抓取之间共享**。同一 app 的两条 job 在 `sys_cron_executions` 里是两个不同的 lease，理论上可能落在不同节点。处理：

- 首选（单节点部署，当前形态）：进程内 token bucket，key = `client_id`，容量 100/min；每次响应用 `X-Ratelimit-Remaining/Reset` 校准。
- 多节点：把窗口写进 `reddit_api_budget (app_id, window_start, used)` 做原子 upsert 共享，或走已注入的 `rdb`。**不要**假设进程内计数在多节点下成立。

### KTD-4：内容表先做**工作区作用域**，不做全局内容池

仓库硬规则是「每个查询先按 `workspace_id` 过滤」，且两个工作区监控同一 subreddit 时可以各存一份——看着浪费，但避免了一个真实泄漏：私密/quarantine subreddit 的内容是用 A 的 bot token 抓到的，若进全局池，B 就能查到 A 才有权看的内容。

→ 默认工作区作用域；「公共内容池」列为后续优化，且**必须带可见性闸门**（仅公开 subreddit 入池）。

### KTD-5：写回默认「人工确认后发送」

写回是公开发言，账号风险真实存在（Reddit 对 bot 发言有明确限制）。默认流程：智能体产出草稿 → 落 `reddit_outbound_draft` → 管理员在 UI 确认 → 才真正 POST。可选的自动回复开关必须同时带：每源每小时/每天条数上限 + 仅白名单 subreddit + 仅关键词命中。

---

## 4. 数据模型

新增 6 张表。迁移从 **593** 开始（当前最大 592）。遵守仓库硬规则：**无外键/级联**；**每个索引都是独立的单语句 `CREATE [UNIQUE] INDEX CONCURRENTLY` 迁移**；up/down 成对。

### 4.1 `reddit_source`（抓取目标）

```
id                    UUID PK default gen_random_uuid()
workspace_id          UUID NOT NULL
installation_id       UUID NOT NULL          -- 软引用 channel_installation
subreddit             TEXT NOT NULL          -- 不带 r/ 前缀，存小写
listing               TEXT NOT NULL DEFAULT 'new'
                      CHECK (listing IN ('new','hot','top','rising','search'))
query                 TEXT                   -- listing='search' 时必填
sort_window           TEXT                   -- top 用：hour|day|week|month|year|all
include_nsfw          BOOLEAN NOT NULL DEFAULT false
min_score             INTEGER NOT NULL DEFAULT 0     CHECK (min_score >= 0)
min_comments          INTEGER NOT NULL DEFAULT 0     CHECK (min_comments >= 0)
keyword_include       TEXT[] NOT NULL DEFAULT '{}'   -- 空数组 = 不按关键词过滤
keyword_exclude       TEXT[] NOT NULL DEFAULT '{}'
status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused'))
cursor_fullname       TEXT                   -- 增量分页游标（上一轮最新 t3_）
last_polled_at        TIMESTAMPTZ
consecutive_failures  INTEGER NOT NULL DEFAULT 0
last_error            TEXT
created_by_user_id    UUID
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
CHECK (listing <> 'search' OR (query IS NOT NULL AND length(btrim(query)) > 0))
CHECK (listing <> 'top'    OR sort_window IS NOT NULL)
```

> CHECK 必须显式处理 NULL：`length(btrim(x)) > 0` 在 x 为 NULL 时是 NULL，而 CHECK 对 NULL 视为通过 —— 上面的谓词都落到了确定布尔值。

### 4.2 `reddit_post`（帖子快照）

```
id                    UUID PK
workspace_id          UUID NOT NULL
source_id             UUID NOT NULL          -- 首次发现它的 source（软引用）
reddit_fullname       TEXT NOT NULL          -- 't3_xxx'
subreddit             TEXT NOT NULL
author_name           TEXT                   -- 合规清理时置 NULL
title                 TEXT NOT NULL
selftext              TEXT NOT NULL DEFAULT ''
url                   TEXT
permalink             TEXT NOT NULL
is_self               BOOLEAN NOT NULL DEFAULT false
score                 INTEGER NOT NULL DEFAULT 0
num_comments          INTEGER NOT NULL DEFAULT 0
upvote_ratio          NUMERIC
is_nsfw               BOOLEAN NOT NULL DEFAULT false
created_utc           TIMESTAMPTZ NOT NULL   -- Reddit 侧发布时间
fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now()
content_fingerprint   BYTEA NOT NULL         -- sha256(subreddit|fullname|title|selftext)，32 字节
content_version       INTEGER NOT NULL DEFAULT 1 CHECK (content_version > 0)
deleted_on_reddit_at  TIMESTAMPTZ            -- 删除同步发现后立即硬删，此列仅作审计窗口
promoted_lead_id      UUID                   -- 一键存为线索后回填
raw                   JSONB NOT NULL DEFAULT '{}'::jsonb
CHECK (octet_length(content_fingerprint) = 32)
```

`content_fingerprint` 沿用 `daily_opportunity_candidate.source_fingerprint`（同样是 `BYTEA(32)` + `octet_length = 32`）的既有模式：用于识别「帖子被编辑过」。

### 4.3 `reddit_comment`

```
id, workspace_id, post_id, reddit_fullname ('t1_xxx'), parent_fullname,
author_name, body TEXT NOT NULL, score INTEGER, depth INTEGER NOT NULL DEFAULT 0,
created_utc TIMESTAMPTZ NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_on_reddit_at TIMESTAMPTZ, raw JSONB
```

### 4.4 `reddit_ingest_run`（每源每次抓取的审计）

```
id, workspace_id, source_id, started_at, finished_at,
pages INTEGER, requests_used INTEGER, items_seen INTEGER,
items_new INTEGER, items_updated INTEGER, items_filtered INTEGER,
outcome TEXT CHECK (outcome IN ('ok','rate_limited','partial','failed')),
error TEXT
```

### 4.5 `reddit_outbound_draft`（写回草稿）

```
id, workspace_id, agent_id, installation_id,
kind TEXT CHECK (kind IN ('comment_reply','submit_self','submit_link','dm')),
target_fullname TEXT,        -- 回复目标 / 私信收件人
subreddit TEXT,              -- 发主贴用
title TEXT, body TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','approved','sent','rejected','failed')),
requested_by_user_id UUID, decided_by_user_id UUID, decided_at TIMESTAMPTZ,
sent_fullname TEXT, error TEXT, created_at, updated_at
CHECK (status IN ('pending') OR decided_at IS NOT NULL)
```

### 4.6 `reddit_api_budget`（跨节点限流预算，仅多节点需要）

```
app_id TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL,
used INTEGER NOT NULL DEFAULT 0, reset_at TIMESTAMPTZ,
PRIMARY KEY(app_id, window_start)
```

### 4.7 索引迁移清单（每个文件一条语句）

| 迁移 | 语句 |
|---|---|
| 593 | `reddit_source` 建表（§4.1）+ 其余表在后续文件 |
| … | `CREATE UNIQUE INDEX CONCURRENTLY reddit_source_workspace_sub_idx ON reddit_source (workspace_id, subreddit, listing)` |
| … | `CREATE INDEX CONCURRENTLY reddit_source_active_idx ON reddit_source (status, workspace_id) WHERE status = 'active'` |
| … | `CREATE UNIQUE INDEX CONCURRENTLY reddit_post_workspace_fullname_idx ON reddit_post (workspace_id, reddit_fullname)` |
| … | `CREATE INDEX CONCURRENTLY reddit_post_feed_idx ON reddit_post (workspace_id, created_utc DESC)` |
| … | `CREATE INDEX CONCURRENTLY reddit_post_source_idx ON reddit_post (source_id, created_utc DESC)` |
| … | `CREATE UNIQUE INDEX CONCURRENTLY reddit_comment_workspace_fullname_idx ON reddit_comment (workspace_id, reddit_fullname)` |
| … | `CREATE INDEX CONCURRENTLY reddit_comment_post_idx ON reddit_comment (post_id, created_utc)` |
| … | `CREATE INDEX CONCURRENTLY reddit_ingest_run_source_idx ON reddit_ingest_run (source_id, started_at DESC)` |
| … | `CREATE INDEX CONCURRENTLY reddit_outbound_draft_status_idx ON reddit_outbound_draft (workspace_id, status, created_at DESC)` |

`daily_opportunity_candidate.source_fingerprint` 的先例提醒：`BYTEA(32)` 用 `octet_length` 断言，不要用 `length`（那是字符数）。

---

## 5. 抓取管线

### 5.1 一次 tick 的完整流程（单 source）

```
1. 读 reddit_source 行（status='active'）与所属 installation
2. decodeCredentials(config, box.Open) → credentials
3. 取该 client_id 的共享 oauthClient + 额度预算
4. 组装 listing URL（见 §5.2），GET，带 User-Agent
5. 预算检查：X-Ratelimit-Remaining < 10 → 记 outcome='rate_limited'，正常返回
6. 逐 child 处理：
   kind 必须为 't3'，否则跳过
   → 过滤：is_nsfw / min_score / min_comments / keyword_include / keyword_exclude
   → fingerprint = sha256(subreddit|fullname|title|selftext)
   → UPSERT on (workspace_id, reddit_fullname)
      命中且 fingerprint 变 → 更新正文 + content_version++ + 发事件（帖子被编辑）
      命中且 fingerprint 同 → 只更新可变统计（score / num_comments / upvote_ratio）
      未命中 → INSERT + 发事件
7. 分页：after=<最后一个 fullname>，最多 3 页（300 条）
   停止条件（任一）：
     a. 遇到已存在的 fullname 且 listing 是 new/rising（已追平）
     b. 最新一条 created_utc < last_polled_at - 5min（重叠窗口）
     c. 达到页数上限
8. 写 reddit_ingest_run；更新 last_polled_at / cursor_fullname；
   consecutive_failures 成功清零、失败 +1（≥5 自动置 status='paused' 并发通知）
```

### 5.2 用到的 Reddit 接口

| 目的 | 端点 | 备注 |
|---|---|---|
| 抓新帖 | `GET /r/{sub}/new?limit=100&raw_json=1` | 增量主路径 |
| 热门 | `GET /r/{sub}/hot` 或 `/rising` | 可配 |
| 榜期 | `GET /r/{sub}/top?t={window}` | window: hour/day/week/month/year/all |
| 关键词 | `GET /r/{sub}/search?q={q}&restrict_sr=1&sort=new&limit=100` | 也是绕过 1000 条上限的手段 |
| 线程评论 | `GET /comments/{article}?limit=100&depth=` | 按需，不默认抓（见下） |
| 批量存活检查 | `GET /api/info?id=t3_a,t3_b,...` | 单次最多 100 个 fullname，供删除同步用 |
| 发布评论 | `POST /api/comment`（`parent` + `text`） | 已有实现可提取复用 |
| 发主贴 | `POST /api/submit`（`sr`+`title`+`kind=self\|link`+`text\|url`） | 常量 `apiSubmission` 已声明但零引用 |
| 私信 | `POST /api/compose`（`to`+`subject`+`text`） | **修正现有 DM 回复错误** |

**评论默认不抓。** 一个热门帖可能有 5000+ 条评论，Reddit 每页最多 100 条且深层评论藏在「load more」后面（需逐个 MoreComments 再请求）。策略：**按需抓**（智能体或用户在 UI 点「展开讨论」时，抓顶层 N 条 + 最多 M 个 more 节点），并对同一 post 做 TTL 缓存（建议 10 分钟）。无节制抓评论是打爆 100 QPM 额度最快的方式。

### 5.3 分页与增量

- 游标统一用 fullname（`t3_xxx`），不用时间戳——Reddit 的 `created_utc` 有秒级并列。
- 每个 source 保留 5 分钟重叠窗口，用于抵消「本轮抓取期间新发的帖子被漏掉」。
- 幂等由 `(workspace_id, reddit_fullname)` 唯一索引保证，重复抓不会产生重复行。
- **绝不在抓取路径里忽略 429**；`auth.go` 的 `do()` 增加 429 分支：读 `X-Ratelimit-Reset` → 写入预算 → 返回可重试错误（scheduler 会按退避重试）。

---

## 6. 合规删除与保留

### 6.1 保留期

| 内容 | 默认 | 配置项 |
|---|---|---|
| `reddit_post` 全文 | 30 天 | `ITEAMIFY_REDDIT_CONTENT_RETENTION_DAYS` |
| `reddit_comment` 全文 | 14 天 | `ITEAMIFY_REDDIT_COMMENT_RETENTION_DAYS` |
| 作者名 | 与内容同生命周期 | — |
| 已发现被 Reddit 删除的内容 | **立即硬删，不留副本** | — |

「保留已删除内容（即使去标识化）也违规」，所以删除必须是 `DELETE`，不能是「把 body 置空、保留行」。`reddit_ingest_run` 这类**不含用户内容**的审计行可以长期保留。

### 6.2 `reddit_content_retention` job

- Cadence 6 小时，Scope `ScopeGlobal`
- 步骤：
  1. 取 `fetched_at < now() - 保留期` 之外的候选行，分批（每批 ≤100 fullname）调 `/api/info`；
  2. 响应里缺失的行、`removed_by_category` 非空、`author == '[deleted]'`、`selftext == '[removed]'` → 视为已删除 → 置 `deleted_on_reddit_at` 并**立即 `DELETE`**（评论一并删）；
  3. 超过保留期的行直接 `DELETE`；
  4. 已 `promoted_lead_id` 不为空的行**不能连带删线索**，但线索里的 Reddit 原文摘录必须同步清空（见 §7.3）；
  5. 写审计：删除条数、比对批次数、剩余额度。
- 单次额度上限：1000 次请求/run（10 个批次），不足则下个 plan 继续，不 sleep。

---

## 7. 消费面（让内容真正有用）

### 7.1 智能体按需读取（首选落地面）

沿用现有 agent 命令范式（`iteamify chat history` ← `internal/handler/chat_history.go`）：HTTP 端点 + task-token 鉴权 + CLI 子命令。

- 端点：`GET /api/agent/reddit/search`、`GET /api/agent/reddit/thread`、`GET /api/agent/reddit/post`
- 鉴权：`X-Actor-Source: task_token` + `X-Task-ID`，否则 403。**这是 load-bearing**：没有它，成员可以伪造 `X-Task-ID` 读别的会话上下文。
- 会话作用域：结果**限定在该任务所属工作区**的 `reddit_post`，不做跨租户检索。
- 命令：`server/cmd/iteamify/cmd_reddit.go`
  - `iteamify reddit search --sub SaaS --query "looking for" --since 7d --limit 20`
  - `iteamify reddit thread <t3_xxx> [--depth 2] [--limit 50]`
- **miss 时实时抓**：库里没有就现场调一次 listing/search 并落库（受同一预算约束），这样智能体不被「已抓取集合」限死。
- 输出统一为一个与渠道无关的 JSON 形状（`{subreddit, items:[{fullname,title,body,score,created_utc,permalink}]}`），智能体永远不直连 Reddit API。

### 7.2 工作区情报页

- 路由：`/{slug}/connections/reddit` 扩展为两个分区——「机器人连接」（现有）与「监控的社区」（新增）。
- 能力：增删/暂停 source、看最近抓取审计（`reddit_ingest_run`）、内容流（按 subreddit/时间/分数/关键词筛）、单条「存为线索」。
- `packages/views/connections/components/channels/reddit-connections.tsx` 里已写好的 `RedditAgentBindButton` **必须挂到智能体详情页**（与 `LarkAgentBindButton`/`SlackAgentBindButton` 并列），否则 §1.2 的第 3 条断点依旧存在。
- 数据层：`packages/core/reddit/` 增加 `sources.ts`（query/mutation）与类型；`packages/core/api/client.ts` 追加端点。

### 7.3 接入 CRM / 每日商机（后续阶段）

- 「存为线索」写入 `leads` 时，`source_type` 需要新值 `reddit` → **需要迁移扩 `lead.source_type` 的 CHECK 约束**（该枚举是封闭的；`migrations/499` 已有 `daily_opportunity` 的先例）。
- 存为线索时**只存结论字段**（组织线索、需求原句、permalink、抓取时间），不整篇复制正文，避免两份合规生命周期。
- 与每日商机打通时复用 `daily_opportunity_candidate.source_lead_id` / `source_job_id` 这两个既有的软引用位，作为新的来源分支，而不是另建候选表。

---

## 8. 写回 Reddit

### 8.1 能力矩阵

| 动作 | 端点 | scope | 阶段 |
|---|---|---|---|
| 回复某条评论/帖子 | `POST /api/comment` (`parent`,`text`) | `submit` | S4 |
| 发主贴（文字/链接） | `POST /api/submit` | `submit` | S4 |
| 回复私信 | `POST /api/compose` | `privatemessages` | S4（**同时修 §1.3 的 DM 缺陷**） |
| 编辑已发内容 | `POST /api/editusertext` | `edit` | 暂不做 |

### 8.2 必要改造

1. **安装时显式传 scope**：至少 `identity,read,privatemessages,submit`（最小权限；`submit` 只在开启写回时申请），并在 `byo_install.go` 里断言返回的 `tokenResponse.Scope` 覆盖所需集合。
2. 把 `outbound.go` 里的 `postComment` 从 `redditSender` 方法提成包级函数（或给 `credentials` 加一个薄的 `client` 门面），让 source 侧与草稿发送共用同一实现，避免两套 POST 逻辑漂移。
3. `reddit_outbound_draft` 的发送走独立 handler：`POST /api/workspaces/{id}/reddit/drafts/{draftId}/approve`（owner/admin）。发送成功后回填 `sent_fullname`，失败落 `error` 且保留草稿可重试。
4. 频率护栏（可配）：每 source 每小时 ≤ N 条、每天 ≤ M 条；命中即拒绝并提示。**新账号建议先只开人工确认模式，观察 1–2 周再考虑自动。**

---

## 9. 前置阻塞项与风险

| 级别 | 事项 | 说明 |
|---|---|---|
| **P0 阻塞** | Reddit Data API 访问申请与商用条款 | 官方要求「联系申请」；免费层仅限非商业/个人/学术，**商业用途需单独签约**。未确认前不要投入 S2 之后的开发 |
| P1 | 现有 100 QPM 是**共享**额度 | 私信轮询 + 内容抓取 + 按需实时抓三者抢同一个 client_id。source 数量必须有限额（建议每工作区 ≤ 10，全平台 ≤ 50） |
| P1 | 账号封禁风险 | 公开帖下自动发言风险高，故 KTD-5 默认人工确认 |
| P1 | 合规硬删 | 见 §6；必须实现，不能降级为软删 |
| P2 | 内容体量 | 一个热门 subreddit 每天新增数百帖；`min_score` 过滤要在落库前生效，否则存储与 UI 都会被灌满 |
| P2 | NSFW / quarantine 子版 | `include_nsfw` 默认 false；quarantine 版块内容默认不抓 |
| P2 | 评论抓取成本 | 5000+ 评论的帖子单次展开就是几十次请求，必须按需 + TTL 缓存 |

---

## 10. 分阶段实施

| 阶段 | 内容 | 交付判定 |
|---|---|---|
| **S0** | 确认 Reddit 访问许可（P0） | 拿到书面许可/条款确认 |
| **S1 修通已有链路** | ① 新增 `reddit/resolvers.go` + 在 `router.go` 注册 ResolverSet；② 加 outbound bus 订阅；③ 挂载 `RedditAgentBindButton`；④ 修 DM 回复端点；⑤ 补 scope；⑥ 加 429 分支与 `X-Ratelimit` 读取；⑦ 修 cutoff/重复投递；⑧ 补 `_test.go` | 提及与私信能真正跑起来并回复；`go test ./internal/integrations/reddit/...` 有实际断言 |
| **S2 抓取落地** | 6 张表 + 索引迁移；`source.go`/`ingest.go`/`normalize.go`/`ratelimit.go`；scheduler job；httptest 单测（解析/分页/过滤/去重/429） | 配一个 source 后库里持续出现新帖，`reddit_ingest_run` 有审计 |
| **S3 消费面** | agent 三个端点 + `cmd_reddit.go`；`packages/core/reddit` 数据层；`/{slug}/connections/reddit` 情报页 | 智能体能回答「r/SaaS 最近有什么人在找 X」；UI 能浏览/筛选内容 |
| **S4 写回** | 草稿表 + 审批端点 + 评论/发帖/私信三种写出 + 频率护栏 + UI 确认流 | 管理员确认后内容真的出现在 Reddit 上；私信也能回 |
| **S5 合规与打通** | retention job；存为线索（含 `lead.source_type` 迁移）；接每日商机 | 删除同步有测试与审计；线索能落 CRM |

**建议先做 S1**——它不依赖任何新表、不触碰 P0 条款，且能把「已经在仓库里躺着的死代码」变成可用功能。

---

## 11. 必测业务不变量

1. 同一 `(workspace_id, reddit_fullname)` 永远不会有两行（唯一索引 + UPSERT 幂等）。
2. 抓取路径在 `X-Ratelimit-Remaining` 低于阈值时必须**提前正常返回** `outcome='rate_limited'`，不得抛错、不得 sleep 超过 run timeout。
3. 任何情况下都不得把 `deleted_on_reddit_at` 已置的行留存在库里超过一轮 retention。
4. 作者名清理必须同时覆盖 `reddit_post`、`reddit_comment`，以及已 `promoted_lead_id` 的线索正文摘录。
5. `reddit_post.raw` / body 中不得出现明文 refresh_token 或 client_secret（安装配置只允许存在 `channel_installation.config` 的加密字段里）。
6. source 的 `include_nsfw=false` 时，NSFW 帖不得落库（不是只在 UI 隐藏）。
7. 草稿在 `status='sent'` 之前不得产生任何对 Reddit 的写请求。
8. 跨工作区隔离：A 的 source 抓到的内容 B 不可见（含 agent 检索路径）。

## 12. 待对齐的参数

1. 内容保留期（默认 30 天 / 评论 14 天）是否接受？
2. 每工作区 source 数量上限（建议 10）与全平台上限（建议 50）？
3. 写回是「先只做人工确认」还是一开始就要自动回复开关？
4. 是否需要「作者名」长期保留？保留它才能避免重复回复同一人，但会命中「账号删除需清理身份信息」条款（方案默认保留 + 清理）。
5. 评论抓取是「仅按需」还是也要默认抓顶层若干条？
