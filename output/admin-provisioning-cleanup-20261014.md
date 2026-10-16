# Admin、模板发布与托管工作区初始化清理

本次按最终确认范围完成代码和本地数据库清理：保留独立 OpenAgent；删除 admin、模板发布、托管工作区初始化；模型端点与凭据放入工作区设置，仅工作区所有者可以修改或测试。

## 已完成的删除

- 删除 Web admin 路由、页面、导航、旧重定向，以及 `/api/platform/*` 管理接口。
- 删除模板候选审核、发布版本、默认初始化策略、Assembly/Rollout、可复用资产、Blueprint 更新建议、第三方 MCP 发布凭据与探测链路。
- 删除托管初始化队列、后台 worker、健康探针任务、状态轮询、指标、部署 canary 与发布状态校验。
- 删除旧桌面 workspace bootstrap 接口和无人调用的管理计费辅助函数、SQL 写查询。
- 删除相关历史方案、客户池文档、Blueprint 文案、前端类型、API 方法、测试和共享依赖；更新内置技能说明及 MCP 架构文档。
- 已应用的历史数据库迁移保持不变，通过新增迁移向前清理。

## OpenAgent 的当前配置方式

入口为 `/{workspaceSlug}/settings?tab=openagent`，Web 与 Desktop 使用同一个共享设置组件。

- 工作区所有者可以保存端点、模型 ID、API 密钥及测试连接；admin/member 只能查看脱敏配置。
- 端点使用兼容 Anthropic Messages API 的公开 HTTPS 地址。拒绝私网地址、URL 内凭据、查询参数与 HTTP 重定向，并在连接时校验解析出的 IP。
- 密钥加密保存，不回传浏览器；留空表示保留当前密钥。版本号防止旧页面覆盖更新。
- 共享 daemon 领取任务后按任务工作区获取配置。凭据仅进入模型客户端，不进入工具环境；没有全局模型凭据回退。
- 保存配置与工作区删除使用事务锁协调，删除工作区会显式清理凭据；任务和连接测试结束后释放 HTTP 连接。
- 独立系统 OpenAgent 保留工作区隔离及受限 MCP 执行策略。普通工作区创建、内置静态智能体模板和用户主动发起的新手引导继续使用现有通用能力。

主要代码：

- [共享设置页](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/packages/views/settings/components/openagent-tab.tsx)
- [权限、加密及配置接口](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/handler/workspace_openagent.go)
- [工作区配置 SQL](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/pkg/db/queries/openagent.sql)
- [公开 HTTPS 连接约束](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/openagentendpoint/endpoint.go)
- [部署配置](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/siteconfig/config.go)

## 本地数据库

正式迁移器已在 `localhost` 的 `iteamify_local` 执行 658–662，全部为 `succeeded`。

- 删除 14 张旧模板、初始化、发布凭据、Blueprint 与平台 OpenAgent 配置表，以及 agent/runtime/skill/task 的发布来源字段。
- 恢复普通运行环境唯一索引；合并重复句柄时保留智能体与真实任务的运行环境关联。
- 新建 `workspace_openagent_config`，索引通过独立的 `CREATE UNIQUE INDEX CONCURRENTLY` 迁移建立，未添加外键或级联操作。
- 工作区、智能体、运行环境、技能、事项、项目、消息、任务和积分钱包迁移前后均为 0 行；用户仍为 1 行。旧表剩余数量为 0。
- 当前新配置表为 0 行；没有迁移旧全局模型凭据。部署使用配置 schema v5，服务身份与加密主密钥留在部署文件中，模型端点和凭据由各工作区所有者设置。

[本地迁移回执](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/output/admin-provisioning-db-receipt-20261014.json)

## 验证

| 检查 | 结果 |
| --- | --- |
| 全仓 Web/Desktop TypeScript 检查 | 通过 |
| Web 生产构建 | 通过；路由产物无 admin 与平台初始化页面 |
| Core 定向测试 | 11 个文件、226 项通过 |
| Views 定向测试 | 5 个文件、31 项通过 |
| 所有 Go 包编译、Go vet | 通过 |
| 后端、CLI、迁移工具构建 | 通过 |
| 嵌入式 OpenAgent SDK 全部包测试 | 通过 |
| 后端定向回归 | 通过，包括所有者权限、凭据隔离、版本冲突、共享 daemon 领取任务、工作区删除、迁移和模拟 Stripe 履约 |
| 较广后端回归 | handler、daemon、路由、迁移、策略与部署配置全部通过；其余既有失败见下 |
| MCP、端点与任务环境隔离 | 通过 |
| 部署脚本 | 36 项通过；没有执行远端部署 |

数据库回归使用本地临时副本，测试完成后均已删除。Web 构建使用隔离输出目录，并恢复 Next 自动修改的 `next-env.d.ts` 和 `tsconfig.json`。

较广回归仍有已有问题：`chimii-*` 技能目录与测试期望的 `iteamify-*` 名称不一致、两项 Codex 环境变量白名单顺序断言不一致、采样超时测试收到 context deadline 而非预期 PostgreSQL 错误。这些问题也出现在本次修改前的业务清理测试记录中，未扩大本次清理范围修复。

本次没有提交或推送 Git，没有部署生产，也没有使用真实模型凭据或消费模型额度。真实 OpenAgent 任务需在所有者配置模型连接、共享 daemon 在线后验收。本报告取代之前“在平台管理页配置 OpenAgent”的说明。
