# 方案：发送默认改为「单回车」+ settings?tab=shortcuts 同步优化

日期：2026-09-17
状态：待评审（未改动任何代码）

## 1. 结论

「发送默认单回车」在本仓库**不是新增功能，而是一次默认值切换**。

plain Enter 作为 `send` 的合法取值、以及 `Shift+Enter` 接管原生 Enter（段落 / 列表 / 代码块 / 建议选择器优先）的完整实现**已经在位**（MUL-4931、#5532 时期落地）：

- `definitions.ts:330-336` — `isShortcutAllowedForAction("send")` 只放行 `Enter` 与 `Mod+Enter` 两个值，并注明 "Send is the one deliberate exception: plain Enter is supported explicitly."
- `submit-shortcut.ts:26-47` — `shouldReplayNativeEnter()` 把 Shift+Enter 复刻成「旧 Enter」；`submit-shortcut.test.ts:138-235` 已覆盖段落、列表继续、代码块换行、picker 优先。
- `use-composer-submit.ts`、`chat-input.tsx` 等所有 composer 都走同一套 `getShortcut("send")` 通道。

因此核心改动只有 **1 行**，其余全部是「让默认值切换不产生回归」的适配工作。风险最高的三点：

1. **「新建事项」标题编辑器会失去「和弦直接创建」** — `title-editor.tsx:86-91` 的 `titleShortcutSubmitAllowed()` 在 send=plain Enter 时刻意返回 false（#5532：避免半打字标题被 Enter 创建）。今天这是「少数人的配置」，切换后变成「所有人的默认」，属于产品取舍，需拍板。
2. **存量 override 会与新默认值重合** — 曾把 send 手动设成 Enter 的用户，本地存着 `{send: Enter}`；它是合法且仍生效的，但设置页会把它显示成「已自定义」，而「恢复默认」点了没变化。
3. **测试与 e2e 以 Mod+Enter 为前提** — 7 个测试文件 + 1 条 e2e 需要重新标定。

## 2. 现状链路

| 环节 | 位置 | 说明 |
| --- | --- | --- |
| 默认值定义 | `packages/core/shortcuts/definitions.ts:79` | `defaultShortcut: primary("Enter")` |
| 合法值闸门 | `definitions.ts:330-336` | 仅 `Enter` / `Mod+Enter` |
| 持久化 | `packages/core/shortcuts/store.ts` | localStorage key `iteamify_keyboard_shortcuts`，`version: 2`，存 override 差量 |
| 解析 | `store.ts:152-163` `resolveShortcut` | `overrides` 优先，否则取默认 |
| 编辑器按键 | `packages/views/editor/extensions/submit-shortcut.ts` | ProseMirror 插件，priority 100 |
| 标题编辑器 | `editor/title-editor.tsx:100-105, 170-179` | `titleKeymap` 的 Enter 走 `onSubmit`；send 和弦走 `onSubmitShortcut` |
| 原生 textarea | `squads/components/squad-detail-page.tsx:909-916` | Squad 描述对话框，直接用 `shortcutMatchesEvent(send)` |
| 全局监听 | `views/layout/global-shortcuts.tsx` | `GLOBAL_ACTIONS` **不含 send**，无冲突 |
| 设置页路由 | `settings/components/settings-page.tsx:37,89-91,234` | `/settings?tab=shortcuts` 深链已可用，`resolveSettingsTab` 兜底 `profile` |
| 键帽展示 | `views/common/shortcut-keycaps.tsx` + `formatShortcut` | 全部动态渲染，自动跟随默认值 |

## 3. 改动清单

### P0 — 必需（缺一项就有回归）

**3.1 切换默认值（1 行）**

`packages/core/shortcuts/definitions.ts:79`

```ts
// 改前
{ id: "send", category: "general", defaultShortcut: primary("Enter"), allowInEditable: true },
// 改后
{ id: "send", category: "general", defaultShortcut: createShortcutChord("Enter"), allowInEditable: true },
```

不改 `isShortcutAllowedForAction`：用户仍可切回 Mod+Enter，合法值集合不变。

**3.2 存量 override 归一化（新发现，必须做）**

在 `packages/core/shortcuts/store.ts` 新增并接入 hydration：

```ts
/** Drop overrides that merely repeat the current default (the default can move). */
export function dropDefaultEqualOverrides(overrides: ShortcutOverrides): ShortcutOverrides {
  const next: ShortcutOverrides = {};
  for (const [actionId, chord] of Object.entries(overrides)) {
    const id = actionId as ShortcutActionId;
    if (shortcutChordEquals(chord, SHORTCUT_ACTION_BY_ID[id].defaultShortcut)) continue;
    next[id] = chord;
  }
  return next;
}
```

接入两处，保证任何版本路径都归一化：

- `migrateShortcutState()` 的两个分支返回前各套一层；
- persist 的 `merge: (persisted, current) => ({ ...current, overrides: dropDefaultEqualOverrides(sanitizeShortcutOverrides(stored?.overrides)) })`。

对现状是 no-op（`setShortcut` 已阻止写入等于默认的值），只影响「默认值移动过」这一种情况；幂等，可反复执行。**不需要 bump persist version。**

**3.3 标题编辑器行为确认（决策点 2 的前置）**

`title-editor.tsx:857` 的注释、`titleShortcutSubmitAllowed` 的语义都建立在「默认 send = 和弦」之上。若接受现状，只改注释；若要让标题也吃单回车，必须同时改 `titleShortcutSubmitAllowed`，并接受 #5532 的误创建风险（见 §5 决策点 2）。

**3.4 测试重新标定**

| 文件 | 处理 |
| --- | --- |
| `core/shortcuts/store.test.ts:22,60` | 默认值断言改为 `createShortcutChord("Enter")` |
| `core/shortcuts/store.test.ts:65` | 用例名与断言仍成立（合法值集合不变），仅核对默认值 |
| `views/editor/title-editor.test.tsx:143` | 「allows the default Mod+Enter chord」→ 改为「显式 override 为 Mod+Enter 时允许」 |
| `views/editor/title-editor.shortcut.test.tsx:41` | 「fires onSubmitShortcut on the default Cmd+Enter chord」→ 改为显式 pin Mod+Enter override；**新增**「默认时 plain Enter 由 keymap 接管、onSubmitShortcut 不触发」 |
| `views/settings/components/keyboard-shortcuts-tab.test.tsx:66,88-107` | 随 §4 的控件化重写 |
| `views/issues/components/comment-composers.test.tsx:170,722,964`、`comment-card-edit-gate.test.tsx:276`、`modals/create-issue.test.tsx:329-341`、`modals/feedback.test.tsx:202`、`chat/components/chat-input-draft-isolation.test.tsx:53,440` | **不改语义**：这些用例测的是「绕过按钮的上传门禁」，与默认值无关。在各用例里显式 `useShortcutStore.setState({ overrides: { send: createShortcutChord("Enter", { primary: true }) } })` 把意图钉住，避免按键改动引入二次漂移 |
| `e2e/comments.spec.ts:47` | `page.keyboard.press("ControlOrMeta+Enter")` → `"Enter"`；建议新增一条「Shift+Enter 换行且不发送」 |
| `core/shortcuts/definitions.test.ts:112-113` | 自建 chord 的 `formatShortcut` 断言，不受影响 |

**3.5 注释纠偏（避免后续误读）**

这些位置的注释把默认值写死成 Cmd/Mod+Enter，改默认后全部失真，统一改成「the configured send chord」：

`editor/use-composer-submit.ts:88,155`、`editor/use-upload-gate.ts:21`、`chat/components/chat-input.tsx:249,408,429`、`issues/components/comment-composers.test.tsx:170`、`modals/create-issue.tsx:857`。

### P1 — settings?tab=shortcuts 优化（用户明确要求）

现状四个缺陷：

1. `send` 只有两个合法值，却用「录制任意组合键」的交互 — 用户点进去按 Shift+Enter、C、Cmd+K 只会收到报错，需要试错才能猜到合法集合。
2. `send_error` 文案泄漏内部术语：en 为 `"Send can only use Enter or Mod+Enter."`，**「Mod」对用户没有意义**（Mac 上显示 ⌘、Windows 上是 Ctrl）。
3. 提示是单向的：`send_enter_hint` 只在已选 Enter 时出现；默认（Mod+Enter）状态下，页面没有任何地方告诉用户「Enter 是换行」。
4. 与 §3.2 联动：默认值移动后，「已自定义 / 恢复默认」的状态显示会不自洽（已由 3.2 修掉）。

优化设计：

- **A. send 行改为二选一分段控件**（`keyboard-shortcuts-tab.tsx` 的 `ShortcutRow` 增加 `variant="binary"` 分支）：两段分别是 `Enter` 与 `Mod+Enter`，都用 `ShortcutKeycaps` 渲染（平台自适应 ⌘↵ / Ctrl+Enter），点击即 `setShortcut`，不再进入录制态。其余 16 个动作保持录制交互不变。
  - 保留 `findShortcutConflict` 校验；`{ kind: "send" }` 错误分支降级为兜底（理论上不可达）。
  - **保持 `SHORTCUT_ACTIONS` 顺序与分组不变**，减少无关改动。
- **B. 提示双向化**：新增 `send_mod_enter_hint`，选中哪个值就显示另一条（选中 Enter → 讲 Shift+Enter 换行；选中 Mod+Enter → 讲 Enter 换行）。
- **C. `send_error` 改写**，去掉 "Mod"：en `"Send can only use Enter or the shortcut with Command/Control."`，四语言同步。
- **D. 路由层不动**：`/settings?tab=shortcuts` 已是 `ACCOUNT_TAB_KEYS` 成员、导航可见、`resolveSettingsTab` 有兜底，深链与刷新都正常。可选增强是让聊天输入框的 tooltip 挂一个跳转到该 tab 的入口，属于加分项，可延后。

文案改动落在 `packages/views/locales/{en,zh-Hans,ja,ko}/settings.json` 的 `shortcuts` 段；漏改会被 `locales/parity.test.ts` 拦下（改前先跑一次它确认覆盖范围）。

## 4. 改前 / 改后按键行为矩阵

| 场景 | 焦点位置 | 改前（默认 Mod+Enter） | 改后（默认 Enter） |
| --- | --- | --- | --- |
| 聊天 / 评论 / 回复 / 描述 / 反馈 | 正文编辑器 | Enter 换行，Mod+Enter 发送 | **Enter 发送**，Shift+Enter 换行（复刻旧 Enter） |
| 同上 | 建议选择器（@ / /）打开时 | Enter 采纳候选项 | **不变**：picker 优先，仍采纳候选 |
| 同上 | 中文输入法组合中 | Enter 提交候选字 | **不变**：`isImeComposing` 拦住，不发送 |
| 新建事项 | 标题（单行） | Enter 结束标题编辑，Mod+Enter 创建 | Enter 结束标题编辑；**没有任何键能直接创建**（需点击按钮） |
| 新建事项 | 描述编辑器 | Enter 换行，Mod+Enter 创建 | **Enter 创建**，Shift+Enter 换行 |
| Squad 描述对话框 | 原生 textarea | Enter 换行，Mod+Enter 保存 | **Enter 保存**，Shift+Enter 换行（无需改代码） |
| 设置页 | 任意 | — | 点 Mod+Enter 可随时切回 |

## 5. 需要拍板的决策点

1. **存量用户**：A. 全量切到单回车，想保留旧习的用户自己去设置切回（推荐，符合「默认值」语义）；B. 迁移时给存量状态显式写入 `{send: Mod+Enter}` 以保留旧行为 — 需要 bump `version: 3` 并在 migrate 里写死，且与 §3.2 的归一化互斥（只能二选一）。
2. **新建事项标题**：A. 接受「Enter 只结束标题编辑」（推荐，避免 #5532 的误创建）；B. 让标题也响应单回车创建；C. 折中 — 标题保留现状，但按钮上的键帽在 send=Enter 时不再显示（因为它已不代表任何可用键）。
3. **设置页交互**：A. send 行改二选一控件 + 双向提示（推荐）；B. 只改文案，保留录制（改动最小，但试错感仍在）。

## 6. 验证清单

- `pnpm typecheck`、`pnpm test`（重点：`core/shortcuts`、`views/editor`、`views/settings`、`views/issues`、`views/chat`、`views/modals`）
- `pnpm playwright test e2e/comments.spec.ts`
- 手动：聊天 / 评论 / 回复 / 描述 / 反馈 各自 Enter 发送、Shift+Enter 换行、输入法组合中 Enter 不发送
- 手动：建议选择器打开时 Enter 采纳候选而非发送
- 手动：设置页默认显示 Enter → 切 Mod+Enter 立即生效并刷新后保持 → 恢复默认回 Enter
- 手动：老数据回归 — 在改前版本把 send 设为 Enter，升级后设置页该行应显示为「默认」而非「已自定义」
