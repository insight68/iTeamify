# Session 业务容器

2026-10-12：实现普通对话、合同审阅及对象应用配置，共用 Web/Desktop 业务界面。这里的容器是界面和业务模块。

## 使用方式

所有成员都可从左侧“配置 → 应用”打开应用介绍和服务提供者列表。管理员在“合同审阅 → 管理配置 → 新增配置”选择真人或 Agent，填写服务要求并启用。普通对话默认可用；只有对方已启用合同审阅时，新建会话才提供该选项。申请者不需要拥有应用。同一对象下的不同 session 可以使用不同容器；刷新后由服务端元数据恢复。

合同审阅要求填写标题并上传合同文件，可同时填写合同类型、业务背景和重点审查事项。支持 PDF、Word、TXT，每份文件不超过 20 MiB，每份申请累计最多 10 个文件，单次请求最多 50 MiB。优先级、期望完成日期和商机阶段随申请保存。

真人处理流程：提交 → 受理 → 审阅中 → 完成。处理者可要求补充；申请者在“待补充”时修改字段、补充文件并重新提交。结果、处理历史和可选讨论关联同一个 session。

新建 Agent 合同申请在提交时自动、原子地创建任务和真实提交凭证；补充材料和明确重试各派发一轮，打开应用或查看详情不会启动任务。Agent 通过业务资源读取申请、下载文件、预览并执行受理、开始审阅、要求补充和完成动作。运行完成不等同于申请完成，必须成功保存业务结果。

Agent 服务需要已配置运行环境及私密文件读取能力。当前仅提供 MCP 的平台托管运行环境没有合同文件读取工具，启用时会明确拒绝；已注册且支持 `iteamify contract-file download` 的运行环境可以排队办理，离线或繁忙不会丢失申请。

## 数据和权限

`chat_session.kind` 继续表示 `agent` 或 `direct`。`container_type` 表示主容器，默认 `conversation`；`container_resource_type` / `container_resource_id` 关联独立业务记录。第一期不支持修改已有 session 的主容器类型。

```json
{
  "container": {
    "type": "contract_review",
    "resource": {
      "type": "contract_review",
      "id": "00000000-0000-0000-0000-000000000001"
    }
  }
}
```

`contract_review` 与 session 使用同一个 UUID，独立保存字段、业务状态、结果、版本和双方业务已读游标。`contract_review_file` 保存文件信息与加密密钥，`contract_review_action` 保存操作历史及请求幂等信息。业务活动参与话题和团队排序；读取聊天消息不会消除未查看的业务结果。

真人记录仅当前工作区内的两名参与者可读；Agent 记录仅创建者及其当前 session 的任务可读。任务必须匹配工作区、Agent、session 和发起者，不能通过其他任务读取申请。写入时再次验证当前成员、Agent 可调用权限、session 状态、角色和业务版本。

文件以 AES-GCM 密文写入现有存储，通过鉴权下载入口解密；API 不返回对象地址或密钥。创建或更新失败会回滚数据库并补偿清理文件。主动删除 session 或工作区时显式清理业务记录、任务提交凭证，并在事务成功后删除文件。运行环境的破坏性清理如会删除关联合同申请，则返回 409，要求先迁移 Agent，保护历史。

`session_application` 保存工作区、处理对象、应用绑定、状态和配置版本；同一对象同一应用只有一份配置。普通成员只读公开提供者信息及自己的配置，只有管理员能管理配置，配置权不授予私密申请访问权。新合同提交必须携带 `application_id` 和 `application_version`，事务内重新校验启用状态、对象和规则。提交后保存完整规则快照，暂停或修改只影响新申请。旧合同记录不自动为对象开通应用，继续保留原处理方式。

业务通知使用参与者定向事件。创建用稳定 session UUID 与提交摘要幂等；更新携带 `request_key` 和 `version`。过期版本或同键异内容返回 409。客户端保留输入，先刷新记录再重新操作。

## 接入位置

| 层 | 入口 |
| --- | --- |
| 应用介绍、服务提供者与配置管理 | `packages/views/applications/applications-page.tsx` |
| 应用发现、配置接口与规则校验 | `server/internal/handler/session_application.go`、`server/internal/service/session_application.go` |
| Session 容器宿主及普通对话工厂 | `packages/views/chat/session-containers/container-host.tsx` |
| 合同表单、详情、动作、讨论 | `packages/views/chat/session-containers/contract-review-container.tsx` |
| API schema、Query/mutation、按身份隔离的草稿 | `packages/core/session-containers/` |
| 领域事务、状态转换、文件保存 | `server/internal/service/contract_review.go` |
| 人类 API、私密文件下载、定向事件 | `server/internal/handler/contract_review.go` |
| Agent 业务资源 | `server/internal/handler/assistant_resource_contract_review.go` |
| Agent 文件命令 | `server/cmd/iteamify/cmd_contract_file.go` |
| SQL、迁移 | `server/pkg/db/queries/contract_review.sql`、`server/migrations/641_*` 至 `653_*` |

新增内置容器时，定义稳定类型及独立业务服务，在宿主注册按需加载的组件，为普通对话提供工厂，避免在打开业务详情时挂载聊天控制器。补齐 schema、双方权限、版本与幂等、文件清理、活动和独立已读；需要 Agent 操作时接入现有 Assistant Resource Registry 并同步更新内置技能。

| API | 用途 |
| --- | --- |
| `GET /api/session-applications` | 全员应用目录、按原沟通权限过滤的服务提供者、本人或管理员配置；可按目标筛选 |
| `POST /api/session-applications` | 管理员新增配置 |
| `PUT /api/session-applications/{applicationId}` | 管理员携带版本编辑、启用或暂停 |
| `DELETE /api/session-applications/{applicationId}` | 管理员删除未被引用的草稿 |
| `POST /api/contract-reviews` | multipart：`request` JSON 和 `files`，创建申请并冻结配置 |
| `GET /api/contract-reviews/{sessionId}` | 读取申请、文件信息、处理历史和权限 |
| `POST /api/contract-reviews/{sessionId}/actions` | multipart：业务操作 JSON 和可选补充文件 |
| `POST /api/contract-reviews/{sessionId}/read` | 按实际看到的版本标记业务已读 |
| `GET /api/contract-review-files/{id}/download` | 成员或当前任务鉴权下载 |

新客户端发送 `X-Client-Capabilities: session-containers-v1`。缺少容器字段的旧响应按普通对话解析；明确未知类型显示只读提示，不挂载聊天输入。旧客户端访问或发送业务 session 时返回 426，要求升级。

Agent 文件命令使用当前任务凭证：

```sh
iteamify contract-file download <file-id> --output <new-local-path>
```

文件以 0600 权限创建，已有路径不会覆盖。Agent 动作沿用业务资源网关的预览、明确确认和幂等机制。结构化任务以真实 `contract_submission_id` 作为 `user_intent_submission_id`，只授权该任务、该申请的审阅动作，不伪造聊天消息、不授权其他资源。

## 本地验收

已在独立 PostgreSQL 数据库与本地服务中验证迁移、事务回滚、重试幂等、双方权限、第三方隔离、任务跨 session 隔离、文件密文保存及鉴权下载、独立已读和删除清理。

2026-10-12 本地检查：前端 core 84 项测试、页面及控制器 18 项测试、core/views 与 Desktop 类型检查、变更文件 lint、相关 Go 测试与构建、Web 生产构建通过。浏览器用例 `e2e/session-containers.spec.ts` 与 `e2e/team-chat.spec.ts` 通过：双方完整合同流程、实时同步、刷新、下载、讨论切换、窄屏布局、Agent 提交自动排队、失败重试及补充材料派发，以及原有历史恢复、真人私信、草稿和丢回执恢复。

新增能力限制测试确认：未注册运行环境或 MCP-only 托管环境不能启用合同服务，过期配置不能绕过提交校验，普通对话的应用发现仍可正常返回。

Agent 资源读取与业务动作使用测试任务验证。真实模型执行、原生 Electron 操作、Mobile 界面和生产部署未验收；本次没有发布到生产。
