---
title: Unified Company Management in Basic Info - PRD
type: feat
date: 2026-08-08
topic: unified-company-basic-info-management
status: implemented
execution: implemented
---

# PRD：移除 Company Settings Tab，将公司管理统一到“基础信息”

> **实施状态（2026-08-08）：** 已完成基础信息页 Company Management Sheet、权威公司名称与可选品牌名、Logo/Slug/Issue 前缀/危险操作迁移、Settings Company Tab 删除，以及旧 query 失效处理。系统仍保留 Workspace Identity 与 Company Business Profile 两个独立保存边界。

## 0. 已确认的产品决策

| 决策 | 结论 |
| --- | --- |
| 公司管理入口 | 基础信息页头部提供“管理公司”，打开右侧管理面板 |
| 公司名称模型 | `workspace.name` 是唯一公司名称；业务资料保留可选“对外品牌名” |
| 危险操作 | 放在管理面板底部的折叠危险区域 |
| 旧链接兼容 | 不兼容；`settings?tab=company` 与 `settings?tab=workspace` 不跳转到基础信息 |

> 说明：由于 `tab` 是 Settings 页面上的 query 参数而不是独立服务端路由，“旧链接直接失效”的具体实现是：从合法 Tab 白名单和兼容映射中移除 `company`、`workspace`，旧 URL 被当作未知 Tab，Settings 按既有规则显示默认个人资料页；不提供跳转、提示条或迁移入口。

## 1. Introduction / Overview

当前产品已经把 `/{workspaceSlug}` 建设为公司的“基础信息”主页，但 `/{workspaceSlug}/settings?tab=company` 仍然保存 Logo、公司名称、Slug、Issue 前缀、离开公司和删除公司等能力。基础信息页头部还需要通过“公司设置”按钮跳回 Settings，形成两个互相指向的公司入口。

这带来三个问题：

1. 用户不知道“公司资料”和“公司设置”哪个才是公司信息的权威入口。
2. `workspace.name` 与业务资料中的 `business_name` 都像公司名称，但生命周期和消费者不同，容易产生不一致。
3. Settings 的 Company Tab 同时混合公司身份、业务资料入口、系统标识和危险操作，信息架构不清晰。

本功能将 `/{workspaceSlug}` 确立为公司信息与公司管理的唯一产品入口：

- 页面主体继续呈现定位、服务、ICP、用户画像和证据等业务事实。
- 页面头部直接显示并维护公司 Logo 和唯一公司名称。
- “管理公司”右侧面板承载 Slug、Issue 前缀、离开公司和删除公司等低频管理操作。
- Settings 继续管理个人偏好、Issue、Chat、通知、Token，以及仓库、集成、成员等横向系统能力，但不再出现 Company/General Tab。

底层无需把 `workspace` 数据表重命名为 `company`。页面是一个聚合界面，可以分别调用 Workspace Identity API 与 Company Business Profile API，但必须让用户感受到它是一份连续的公司档案。

## 2. Goals

- 让 `/{workspaceSlug}` 成为公司身份和公司业务事实的唯一维护入口。
- 从 Settings 导航和内容中彻底删除 Company Settings Tab。
- 将公司名称收敛为一个权威字段，消除头部、侧边栏、工作区切换器和 AI 上下文的名称冲突。
- 保留 Logo、Issue 前缀、离开和删除功能的既有权限、安全确认和缓存行为。
- 让高频业务维护和低频系统管理在同一路由内完成，同时避免危险操作干扰日常阅读。
- Web 与 Desktop 使用同一套 `packages/views` 实现，行为一致。

## 3. Product and Data Model

### 3.1 用户看到的模型

```text
公司基础信息 /{workspaceSlug}
├── 公司身份（高频可见）
│   ├── 公司 Logo
│   ├── 公司名称（唯一）
│   ├── 对外品牌名（可选）
│   ├── 官网
│   └── 公司简介
├── 业务事实（高频维护）
│   ├── 定位与差异化
│   ├── 服务能力
│   ├── ICP 与购买角色
│   └── 案例、证据和资料来源
└── 管理公司（低频右侧面板）
    ├── Logo 与公司名称
    ├── Slug（只读）
    ├── Issue 前缀（风险确认）
    └── 危险操作（折叠）
        ├── 离开公司
        └── 删除公司
```

### 3.2 权威数据归属

| 用户概念 | 权威字段 | 说明 |
| --- | --- | --- |
| 公司名称 | `workspace.name` | 唯一公司名称；侧边栏、切换器、页面标题、通知和任务归属统一使用 |
| 公司 Logo | `workspace.avatar_url` | 页面头部显示，Owner/Admin 可上传 |
| 公司 URL 标识 | `workspace.slug` | 继续只读，不在本功能中支持修改 |
| Issue 前缀 | `workspace.issue_prefix` | Owner/Admin 可修改，必须确认外部引用失效风险 |
| 对外品牌名 | Company Business Profile 的可选 `brand_name` 语义 | 仅当品牌名与公司名称不同才填写和展示 |
| 官网、简介、定位、服务、ICP、画像、证据 | Company Business Profile | 继续使用实时 Profile 保存和后台快照机制 |

### 3.3 `business_name` 的兼容策略

当前 Company Business Profile 的 JSON/API/MCP 使用 `business_name`。不能简单把它继续显示成“公司名称”，否则重复概念仍然存在。

实施策略：

1. 前端页面标题始终读取 `workspace.name`，不再使用 `business_name || workspace.name` 的回退表达式。
2. 在业务 Profile 中新增可选 `brand_name` 语义；UI 文案使用“对外品牌名（可选）”。
3. 为兼容既有 Profile、历史快照和旧 Agent 工具，服务端读取旧内容时按以下规则投影：
   - 若旧 `business_name` 为空或等于 `workspace.name`，`brand_name` 为空。
   - 若旧 `business_name` 与 `workspace.name` 不同，将旧值解释为 `brand_name`，不覆盖公司名称。
4. 新 Profile 保存和 Agent 上下文必须同时包含：
   - `company_name`：来自 `workspace.name`，必填、权威。
   - `brand_name`：可选。
5. 旧 `business_name` 在兼容窗口内可以继续保留在服务内部/历史快照中，但不得再作为可编辑的公司名称出现在新 UI；后续单独版本再决定是否删除旧 JSON 字段。
6. 资料完整度的“公司身份”维度改为检查 `workspace.name + summary`，不得要求可选品牌名。

该策略避免对历史不可变快照做破坏性重写，同时从新 UI 开始消除双名称冲突。

## 4. Information Architecture and Interaction

### 4.1 基础信息头部

头部保持当前组合面板结构，并进行以下调整：

- 公司图标优先显示 `workspace.avatar_url`；无图片时显示 Building 图标占位。
- Owner/Admin 点击 Logo，打开上传控件或管理面板的 Logo 区域。
- 页面主标题只显示 `workspace.name`。
- `brand_name` 存在且与公司名称不同时，在名称下方以“品牌：xxx”的次级标签展示。
- 公司简介继续来自 Business Profile `summary`。
- 右侧操作保留“让 AI 帮我完善”，将原“公司设置”改为“管理公司”。
- 点击公司名称/Logo打开管理面板；点击简介仍进入业务基础编辑器，避免一次提交跨两个 API。

### 4.2 “管理公司”右侧面板

面板宽度建议桌面端 `480–560px`，移动端全屏。面板内部按以下顺序组织：

#### A. 公司身份

- Logo 上传
- 公司名称
- 保存状态
- 仅 Owner/Admin 可编辑；Member 只读
- 公司名称使用自动保存或失焦保存，复用现有 `useAutoSave` 语义
- 名称为空时禁止提交

#### B. 系统标识

- Slug：只读、等宽字体、提供复制按钮
- Issue 前缀：Owner/Admin 可编辑
- 前缀只允许大写字母与数字，最长 10 个字符
- 前缀为空时标记无效且不保存
- 失焦且发生变化时显示风险确认弹窗
- 确认后更新 Workspace，并使该 Workspace 的 Issue 缓存失效
- 取消后保留当前输入，直到用户修正、关闭或再次确认；行为与现有实现一致

#### C. 危险操作

- 默认折叠，标题明确为“危险操作”
- 展开前不展示红色大面积背景，只使用小型危险提示
- Member/Admin/Owner 均按既有规则显示“离开公司”
- 唯一 Owner 不能离开，并显示先转让 Owner 或删除公司的说明
- 唯一成员提示删除公司
- 只有 Owner 能看到“删除公司”
- 删除必须继续使用输入公司名称的二次确认对话框
- 删除请求完成前不可关闭确认对话框；成功后才导航离开当前公司

### 4.3 Settings 调整

- 从 `WORKSPACE_TAB_KEYS` 删除 `general`。
- 从 `WORKSPACE_TAB_VALUES` 删除 `general: "company"`。
- 从 Workspace Tab 图标映射中删除 Company Settings 图标。
- 删除 `<TabsContent value="company">`。
- 删除 `CompanySettingsTab` 的 Settings 引用。
- 删除 `workspace -> company` 的旧 query 映射。
- 不为 `company` 或 `workspace` 新增任何跳转到基础信息的兼容逻辑。
- Settings 的 Workspace 分组从“仓库”或当前实际第一个剩余 Workspace Tab 开始。
- 全仓不得再生成 `?tab=company` 链接。

### 4.4 保存边界

页面虽然统一，但保存必须保持清晰边界：

| 操作 | API/状态源 | 保存策略 |
| --- | --- | --- |
| Logo、公司名称、Issue 前缀 | Workspace API / Workspace Query | 独立保存，更新 Workspace 列表缓存 |
| Slug | Workspace API | 本功能只读 |
| 品牌名、官网、简介、定位等 | Company Profile API / Business Context Query | 使用当前修订号直接保存 |
| 离开、删除 | Workspace Mutation | 显式确认并等待服务端成功 |

不实现一个把 Workspace 与 Business Profile 包装为分布式事务的“全部保存”按钮。避免一个请求成功、另一个失败时制造不可解释的半保存状态。

## 5. User Stories

### US-001：在基础信息页显示权威公司身份

**Description:** 作为公司成员，我希望基础信息页显示统一的公司 Logo 和公司名称，以便明确当前正在查看哪家公司。

**Acceptance Criteria:**

- [ ] 页面主标题始终来自 `workspace.name`
- [ ] 页面不再用 Business Profile `business_name` 覆盖主标题
- [ ] 头部优先显示 `workspace.avatar_url`，无 Logo 时显示占位图标
- [ ] 可选对外品牌名只作为次级信息展示
- [ ] 四字及常见长度中文公司名称优先保持单行并响应式缩放
- [ ] Web 与 Desktop 显示一致
- [ ] Typecheck、lint 通过
- [ ] 使用 browser skill 验证桌面端和移动端

### US-002：在基础信息页打开“管理公司”面板

**Description:** 作为 Owner/Admin，我希望不离开基础信息页即可维护公司系统身份。

**Acceptance Criteria:**

- [ ] 头部“公司设置”按钮改为“管理公司”
- [ ] 点击按钮、公司 Logo 或公司名称可打开右侧管理面板
- [ ] 面板关闭后仍停留在 `/{workspaceSlug}`，URL 不增加 Settings query
- [ ] 桌面端为右侧 Sheet，移动端为全屏 Sheet
- [ ] 面板有可访问标题、描述和关闭按钮
- [ ] 焦点进入面板、关闭后返回触发控件
- [ ] 使用 browser skill 验证

### US-003：维护 Logo 和唯一公司名称

**Description:** 作为 Owner/Admin，我希望在管理面板中修改 Logo 和公司名称，使所有产品表面立即保持一致。

**Acceptance Criteria:**

- [ ] 复用 `AvatarUploadControl` 上传 Logo
- [ ] 公司名称保存到 `workspace.name`
- [ ] 空名称不可保存
- [ ] 保存后 Workspace Query 缓存立即更新
- [ ] 其他在线成员通过 `workspace:updated` 收到更新
- [ ] 侧边栏、工作区切换器和基础信息页无需刷新即可更新
- [ ] Member 可以查看但不能编辑 Logo 和名称
- [ ] 保存失败显示明确错误且不伪装成功
- [ ] 自动保存相关测试迁移到基础信息组件测试
- [ ] 使用 browser skill 验证

### US-004：维护 Slug 和 Issue 前缀

**Description:** 作为 Owner/Admin，我希望在基础信息页查看公司的 URL 标识并谨慎修改 Issue 前缀。

**Acceptance Criteria:**

- [ ] Slug 只读并可复制
- [ ] Issue 前缀输入规范化为大写字母和数字，最大 10 个字符
- [ ] 空前缀不保存并标记 `aria-invalid`
- [ ] 前缀变化后显示包含旧编号和新编号示例的确认弹窗
- [ ] 取消确认不调用更新 API
- [ ] 确认后更新 Workspace 并 invalidate 当前 Workspace 的 Issue Query
- [ ] Member 只能查看，不可修改
- [ ] 使用 browser skill 验证确认弹窗

### US-005：在折叠危险区域离开或删除公司

**Description:** 作为公司成员或 Owner，我希望在公司管理面板内找到与公司生命周期相关的操作，同时避免误操作。

**Acceptance Criteria:**

- [ ] 危险操作默认折叠
- [ ] 非唯一 Owner 的成员可以发起离开公司
- [ ] 唯一 Owner 的离开按钮禁用，并显示正确说明
- [ ] 只有 Owner 可以看到删除公司
- [ ] 删除继续要求输入公司名称确认
- [ ] 离开/删除请求遵循既有 await-then-navigate 或既定防竞态策略
- [ ] 删除失败时保留对话框和当前页面
- [ ] 成功后清理 workspace singleton 并导航到安全目的地
- [ ] 使用 browser skill 验证权限和危险态

### US-006：收敛公司名称与品牌名

**Description:** 作为业务维护者，我希望“公司名称”和“对外品牌名”含义明确，使人和 AI 不再读取两份互相冲突的公司名称。

**Acceptance Criteria:**

- [ ] `workspace.name` 被定义为唯一公司名称
- [ ] 业务基础编辑器不再提供第二个“公司名称”字段
- [ ] 仅提供可选“对外品牌名”字段
- [ ] 旧 `business_name` 与 Workspace 名称不同时可无损投影为品牌名
- [ ] Profile 完整度不要求品牌名
- [ ] Agent Company Context 同时提供权威公司名和可选品牌名
- [ ] Leads/Prospector 新任务快照包含两者且语义明确
- [ ] 历史不可变快照不被重写
- [ ] Go、TypeScript Schema、MCP 工具与内置 Skill 测试通过

### US-007：删除 Company Settings Tab 和所有入口

**Description:** 作为用户，我希望产品只提供一个公司信息入口，避免在两个页面间来回跳转。

**Acceptance Criteria:**

- [ ] Settings 导航不再显示 Company/General Tab
- [ ] Settings 不再挂载 `CompanySettingsTab`
- [ ] 全仓不存在生成 `?tab=company` 的代码
- [ ] 全仓不存在 `workspace -> company` 的旧 Tab 映射
- [ ] `settings?tab=company` 和 `settings?tab=workspace` 不跳转到基础信息
- [ ] 未知 query 值按 Settings 既有安全白名单规则显示默认 Tab
- [ ] 其他 Settings Tab 的 URL、键盘导航和移动端滚动不受影响
- [ ] Settings 与基础信息相关测试更新
- [ ] 使用 browser skill 验证 Settings 导航

### US-008：保持权限、实时更新和错误语义一致

**Description:** 作为协作成员，我希望页面合并后仍然遵循现有角色权限，并能看到其他成员的实时更新。

**Acceptance Criteria:**

- [ ] Owner/Admin 可编辑公司身份和业务 Profile
- [ ] Member 对公司身份和业务 Profile 均只读，但可执行允许的离开操作
- [ ] 服务端权限仍是最终权威，不能只依赖按钮禁用
- [ ] Workspace 更新使用现有 `workspace:updated` 缓存协调器
- [ ] Business Profile 冲突继续返回 409 并刷新最新内容
- [ ] 双状态源的保存提示能指出失败的是“公司身份”还是“业务资料”
- [ ] 关键角色矩阵有组件测试与服务端测试

## 6. Functional Requirements

- **FR-1:** `/{workspaceSlug}` 必须是公司身份与公司业务事实的唯一用户入口。
- **FR-2:** 页面主标题必须读取 `workspace.name`。
- **FR-3:** 页面必须显示 `workspace.avatar_url`；空值使用稳定占位图标。
- **FR-4:** Owner/Admin 必须能在基础信息页内修改 Logo 和公司名称。
- **FR-5:** Member 必须能查看公司管理面板，但 Logo、名称和前缀控件必须只读或禁用。
- **FR-6:** 页面必须提供“管理公司”右侧面板，不得导航到 Settings Company Tab。
- **FR-7:** Slug 必须只读，并提供复制操作。
- **FR-8:** Issue 前缀必须沿用现有规范化、确认、保存和 Issue 缓存失效逻辑。
- **FR-9:** 危险操作必须默认折叠。
- **FR-10:** 离开公司必须保留唯一 Owner 限制和安全导航行为。
- **FR-11:** 删除公司必须仅对 Owner 可见，并沿用名称确认对话框。
- **FR-12:** `workspace.name` 必须成为唯一公司名称，业务 Profile 不得再暴露第二个同义“公司名称”。
- **FR-13:** 可选品牌名必须与公司名称明确区分，并进入 Agent/Leads 上下文。
- **FR-14:** 历史 Business Release/任务快照不得被批量重写。
- **FR-15:** Settings 必须删除 Company/General Tab 的导航、内容、导入和文案。
- **FR-16:** 旧 `company`/`workspace` query 不得跳转到基础信息，也不得恢复已删除 Tab。
- **FR-17:** 基础信息页不得提供跨 Workspace API 与 Business Profile API 的单一“全部保存”事务按钮。
- **FR-18:** Workspace 和 Business Profile 的保存状态与错误提示必须分别可识别。
- **FR-19:** 所有新增交互必须支持键盘操作、焦点管理和读屏标签。
- **FR-20:** Web 与 Desktop 必须复用共享 View，不能分别实现两套公司管理逻辑。

## 7. Non-goals / Out of Scope

- 不支持修改 Workspace Slug。
- 不把成员、仓库、GitHub、集成、标签或自定义属性迁入基础信息页。
- 不重命名 `workspace` 数据表、主键或租户隔离模型。
- 不支持一家公司管理多个独立品牌或 Business Unit。
- 不允许 AI 对话执行 Logo 上传、Issue 前缀修改、离开公司或删除公司。
- 不新增跨 Workspace Identity 与 Business Profile 的分布式事务。
- 不重写历史 Business Release 或既有 Leads/Task 快照。
- 不为 `settings?tab=company`、`settings?tab=workspace` 提供兼容跳转、提示或重定向。
- 不在本功能中移除 Settings 主路由；个人与其他 Workspace Settings 继续存在。

## 8. Design Considerations

### 8.1 视觉原则

- 基础信息页仍然是一份“公司经营档案”，不是把旧 Settings 表单直接贴到页面底部。
- 高频身份信息出现在头部；低频系统标识进入 Sheet；危险操作折叠。
- 管理面板使用清晰的分区和克制的表单密度，不与图表主内容争夺注意力。
- Logo 与公司名称形成一个整体点击目标，但必须有明确 hover/focus 编辑反馈。
- Member 只读态不显示虚假的编辑 hover。

### 8.2 推荐布局

```text
┌──────────────────── 公司基础信息头部 ────────────────────┐
│ [Logo] 公司名称                 [管理公司] [AI 帮我完善] │
│        品牌：可选品牌名                                  │
│        公司简介                                           │
├───────────────────────────────────────────────────────────┤
│ 完整度 │ 服务 │ ICP │ 用户画像 │ 案例与资料              │
└───────────────────────────────────────────────────────────┘

                                   ┌──── 管理公司 Sheet ────┐
                                   │ 公司身份               │
                                   │ [Logo] 公司名称        │
                                   │                        │
                                   │ 系统标识               │
                                   │ Slug [复制]            │
                                   │ Issue 前缀             │
                                   │                        │
                                   │ ▸ 危险操作             │
                                   └────────────────────────┘
```

## 9. Technical Considerations

### 9.1 前端组件拆分

推荐把旧 `workspace-tab.tsx` 的逻辑拆为与路由无关的业务组件，避免把整个 Settings Layout 搬进 Business Page：

- `CompanyManagementSheet`
- `CompanyIdentityEditor`
- `CompanySystemIdentifiers`
- `CompanyDangerZone`
- 现有 `DeleteWorkspaceDialog` 继续复用
- 现有 `AvatarUploadControl` 继续复用
- 现有 `useAutoSave` 可以移动到更通用目录或复用，不应让 Business 组件反向依赖 Settings 页面组件

`packages/views/business` 可以组合这些组件；通用组件放到 `packages/views/company` 或 `packages/views/common`，避免 `business -> settings` 的页面级依赖。

### 9.2 状态管理

- Workspace Identity 继续由 React Query `workspaceKeys.list()` 持有。
- Company Business Profile 继续由 `businessContextOptions(wsId)` 持有。
- Sheet 开关和未提交输入属于本地 View State，不新增 Zustand Store。
- Workspace 更新成功后更新列表缓存；其他客户端由 `workspace:updated` 协调。
- Issue 前缀成功更新后 invalidate `issueKeys.all(workspace.id)`。
- Company Profile 保存继续使用 `expectedRevision` 防止覆盖并发修改。

### 9.3 后端与 Agent 上下文

- Workspace API 权限保持 Owner/Admin。
- Leave API 保持 Member 级别并在 Handler 内检查唯一 Owner。
- Delete API 保持 Owner-only。
- Company Context 投影层应组合 Workspace 名称与 Business Profile，而不是要求每个 Agent 自行推断。
- MCP `company_profile_get` 返回中应明确区分 `company_name` 与 `brand_name`。
- MCP `company_profile_update` 不允许修改系统身份、Slug、Issue 前缀或危险操作。
- AI 若建议修改公司名称，应提示用户在“管理公司”中手动修改；不得通过业务 Profile 写入第二个公司名称。

### 9.4 迁移与兼容

- Business Profile 使用 JSON 内容，新增可选品牌语义无需数据库列迁移。
- 对旧 `business_name` 做读取投影，不批量更新历史 Release。
- 新保存可以保留兼容字段一段时间，但 UI 与新工具不再把它称作公司名称。
- 删除 Company Settings Tab 不删除 Workspace API，其他客户端/CLI 仍可继续调用。
- 按已确认决策，不维护旧 Settings query 的导航兼容。

### 9.5 测试范围

- Business Page：Logo、名称、品牌名、Sheet 打开、权限、保存状态。
- Company Management：名称自动保存、Logo 上传、Slug 只读复制、前缀确认/取消/无效输入。
- Danger Zone：Owner/Admin/Member、唯一 Owner、删除失败、成功导航。
- Settings Page：Company Tab 不存在；未知 `company/workspace` query 落到默认 Tab。
- Core：Workspace Query 缓存更新和 Issue 缓存失效。
- Go：Company Context 投影、旧 `business_name` 兼容、新公司名/品牌名输出。
- MCP/Skill：工具字段、权限和禁止系统级变更。
- Locale：四种语言 key parity。
- Browser：桌面、移动、只读成员、编辑管理员和危险确认。

## 10. Implementation Sequence

1. 定义权威名称与品牌名的 TypeScript/Go 投影模型及兼容测试。
2. 将旧 Company Settings 中与路由无关的身份、前缀和危险操作逻辑拆成共享组件。
3. 在基础信息页接入真实 Logo、权威公司名称和 Company Management Sheet。
4. 接入 Workspace 保存、实时缓存、Issue 前缀确认与缓存失效。
5. 接入离开和删除流程，完成角色矩阵测试。
6. 更新 Company Context、MCP 和 Leads/Task 快照投影。
7. 从 Settings 删除 Company Tab、旧映射、导入、文案和所有 `?tab=company` 链接。
8. 完成四语国际化、类型检查、单元/集成测试和浏览器视觉验收。

每一步都应保持可编译、可测试；在基础信息管理功能可用之前，不应先删除旧 Tab，避免中间状态丢失管理能力。

## 11. Success Metrics

- 代码库中生成 `?tab=company` 的用户入口为 0。
- 用户可在 `/{workspaceSlug}` 内完成 Logo、公司名称、Issue 前缀、离开和删除操作。
- 基础信息页、侧边栏和 Workspace Switcher 对公司名称的展示一致率为 100%。
- 新 Agent/Leads 上下文中不再出现两个都叫“公司名称”的冲突字段。
- Owner/Admin 修改公司名称后，当前客户端无需刷新即可看到更新。
- Member 无法修改公司身份或业务 Profile，但可以按规则离开公司。
- Company Settings 相关能力迁移后，目标测试、typecheck、lint 和浏览器验收全部通过。

## 12. Open Questions

无阻塞产品问题。实施时只需决定 `brand_name` 是作为新的 JSON 字段立即写入，还是在一个兼容版本内通过服务投影映射旧 `business_name`；无论采用哪种内部形式，用户可见语义和本 PRD 的验收标准不变。
