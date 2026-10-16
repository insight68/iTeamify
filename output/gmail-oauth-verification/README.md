# Gmail OAuth 审核材料

准备日期：2026-09-09。当前状态：文案和录制材料已准备，真实演示视频未录制，Google 审核未提交。

## 已核对的实际情况

- Google 项目：`topzeal-2020`；OAuth 应用名：`aurocreator`；品牌页显示已验证。
- 当前 Data Access 页面有 `openid`、`userinfo.email`、`userinfo.profile` 和 `gmail.send`。
- 当前敏感范围说明框上限为 1,000 字符，原内容为“发送和回复客户的问题和咨询”。
- 当前受限范围列表为空；视频字段要求 YouTube 链接，空值时 Save 按钮不可用。
- 线上工作区 Connections 页面可以显示已连接 Gmail 和接收、分析状态；未显示启用发送或邮件发送功能。
- 当前源码在 `server/internal/integrations/gmail/service.go:134` 仍仅请求 `gmail.readonly`，当前原生 Gmail 路由没有发送接口。

## 文件用途

| 文件 | 用法 |
|---|---|
| scope-justification-draft-en.txt | 当前如实说明开发计划，953 字符；可作为草稿，尚不满足功能审核条件 |
| scope-justification-after-implementation-en.txt | 913 字符；仅在所有描述均与可运行实现一致后用于正式提交 |
| recording-script.md | 逐镜头操作、英文旁白、录制前置条件、上传说明 |
| test-message.txt | 虚构客户邮件素材，收件人须替换为自己控制的测试邮箱 |

两份英文文本不能同时粘贴。正式版不能在发送、预览、用户确认等功能尚未完成时使用。

## 成片当前缺少什么

1. 可运行的应用内 Gmail 授权升级、预览、明确确认和真实发送功能。
2. 与当前申报项目和 OAuth 客户端对应的测试环境；客户端清单及实际使用的 Client ID 尚未核对。
3. 可用于真实授权的 Google 测试账号，以及自己控制的收件邮箱。
4. 授权过程、实际发送和结果核验的真实屏幕录像。
5. 最终视频的可访问 YouTube 链接。

现有登录会话或一个正常的 Gmail 读取连接，不能证明具备发送能力。Google 要求功能已经实现，不能仅用未来功能计划申请范围。

## 申报范围与应用行为需要对齐

当前 Google 表单没有列出 `gmail.readonly`，但现有 Gmail 连接代码正在请求该范围。这可能需要核对 Google 项目/客户端对应关系；不能直接认定当前线上 Gmail 使用的就是这个项目。

- 如果这次演示包含邮箱读取、自动分析或自动获取原邮件再回复，应核对所用项目，并声明、解释和实际演示所需读取范围。
- 如果这次只验证 `gmail.send`，测试流程需要真正支持独立发送，不依赖未声明的读取权限。邮件内容来自用户输入或允许使用的客户资料。
- 现有 Gmail 连接使用 profile、watch、history 等读取相关 API，不能只把 scope 改成 send 而不调整执行路径。
- 从 Gmail 网页人工检查已发送邮件，不表示 Aurocreator 获得了读取权限。录像中需要明确说明这一点。
- `openid`、`userinfo.email`、`userinfo.profile` 的登录流程及项目内其他 OAuth 客户端应按实际提交范围一并核对和覆盖。
- 不直接删除生产 Gmail 连接来制造首次授权画面；现有断开逻辑会删除关联本地数据。使用专用测试账号。

## Google 页面

- [本次审核表](https://console.cloud.google.com/auth/scopes;verificationMode=true?project=topzeal-2020)
- [品牌信息](https://console.cloud.google.com/auth/branding?project=topzeal-2020)
- [OAuth 客户端](https://console.cloud.google.com/auth/clients?project=topzeal-2020)
- [验证中心](https://console.cloud.google.com/auth/verification?project=topzeal-2020)

## 官方依据

- [管理数据访问和演示视频要求](https://support.google.com/cloud/answer/15549135?hl=en)：展示实际授权流程、英文同意页、申请范围对应的功能及相关客户端。
- [验证要求](https://support.google.com/cloud/answer/13464321?hl=en)：范围必须对应已实现功能。
- [Gmail 权限列表](https://developers.google.com/workspace/gmail/api/auth/scopes)：send 用于发送；读取及邮箱管理具有不同权限。
- [已验证应用新增范围](https://support.google.com/cloud/answer/13464018?hl=en)：先在测试环境验证新增能力。

素材包没有包含真实客户邮件、OAuth 凭据、授权码或访问令牌，也没有声称已录制或已发送。

