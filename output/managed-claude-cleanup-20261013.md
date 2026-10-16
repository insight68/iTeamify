# Managed Claude Global 清理结果

按确认范围，仅移除平台托管 Claude；保留 OpenAgent、智能体模板发布、默认工作区初始化，以及普通本地 Claude CLI。

## 代码分析与处理

原先默认 Runtime Offering 指向 Claude，而 OpenAgent 虽已支持发布清单，模板发布、执行策略和模型配置仍有 Claude 专用假设。共享部署配置还要求 Claude 端点、凭据和模型；OpenAgent 在平台配置为空时会继承这套配置。上述耦合已经移除。

- 默认托管 Runtime Offering 改为 OpenAgent，发布和解析拒绝 Claude Offering；模板与候选智能体发布使用平台 OpenAgent 模型配置。
- 删除 Claude 专用执行策略、凭据和模型环境配置、托管提示词文件、会话目录隔离、租约与垃圾回收，以及相关历史实现文件和生成补丁。
- 共享 daemon 不再发现或注册 Claude；后端也拒绝托管身份注册 Claude。普通用户 daemon 的 Claude CLI、模型选择、技能设置和会话能力保留。
- 区分 OpenAgent 系统环境与模板绑定环境：注册时同时确认两类记录的可用状态，模板绑定保留发布来源；两者各自保留执行约束。
- 模型和凭据只从数据库中的平台 OpenAgent 配置读取，不再从 Claude 环境回退。系统智能体保留固定只读 MCP 边界；已发布模板保留其经过校验的工具与来源约束。
- 部署配置 schema 升为 v4，部署验证改为检查 OpenAgent 和 daemon 身份，不再检查 Claude 凭据。配置示例及管理页文案已更新。

关键实现：

- [托管发布清单](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/provisioning/manifests.go)
- [模板发布](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/provisioning/template.go)
- [注册与任务领取](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/handler/daemon.go)
- [执行策略](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/managedpolicy/policy.go)
- [OpenAgent 配置获取](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/daemon/openagent_config.go)
- [部署配置](/Users/chunjun/Desktop/Build/Agent-ui/iTeamify/server/internal/siteconfig/config.go)

## 数据库

正式迁移器已在本地 `iteamify_local` 执行 `657_remove_managed_claude_execution_policy`，状态为 `succeeded`。旧托管 Claude 智能体、Offering 运行环境与发布记录均为 0，无需删除历史数据。迁移前后工作区、智能体、运行环境、发布版本、初始化策略、OpenAgent 配置和任务记录计数一致。

执行策略约束现仅允许 `general`、`managed_chat_v1`、`workspace_openagent_v1`。已应用的历史迁移保持原样。

## 验证

- 全仓 TypeScript 类型检查通过。
- 相关 Web 测试 23 项、共享 Runtime Picker 测试 5 项通过；管理功能目录测试 17 项通过，与前述 Web 测试有重叠。
- 10 个后端包的定向回归通过，覆盖模板发布、工作区初始化、OpenAgent 注册、模型目录、执行边界和数据库迁移。数据库测试使用临时副本，测试后已删除。
- 后续注册与策略调整的最终定向回归通过；普通 Claude CLI 参数与启动拒绝、OpenAgent 无凭据回退等回归通过。
- 普通 agent SDK 完整包测试通过；Go vet 全仓通过。
- 后端、CLI、配置工具与迁移器构建通过。
- 部署脚本 36 项本地回归及脚本检查通过，未执行远端部署。

较广范围测试仍观察到已有问题：内置技能名称 `iteamify-runtimes-and-repos` 与现有目录不一致，Codex 环境变量白名单排序断言不一致。定向验证排除了该无关技能命名用例，不代表全量 Go 测试已全部通过。

## 当前状态与后续配置

代码和本地数据库清理已完成，未提交或推送 Git，未部署到生产。当前本地平台 OpenAgent 配置为 0 行，真实模型任务尚未验收；实际运行前需要在平台管理页保存独立的 OpenAgent 模型端点和凭据。已有部署使用新配置工具时，需要将配置调整为 v4 并移除旧 Claude 配置字段。

本次修改基于任务开始时的文件快照，保留工作区已有的大量其他变更。
