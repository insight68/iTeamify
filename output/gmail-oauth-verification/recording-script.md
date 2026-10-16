# aurocreator Gmail 发送权限演示：录制脚本

状态：待发送功能实现后录制。这是拍摄脚本，不是已录制的视频，也不是功能验收证据。
建议时长约 3–4 分钟；以下时间为排练安排，不是 Google 规定的时长。

## 拍摄前置条件

- 使用真正可运行的测试部署。新权限的测试入口只对测试人员开放。
- 核对测试环境、申报项目和实际 OAuth Client ID；如使用单独测试项目，明确向审核人员标注，并按 Google 要求说明与提交项目的关系。
- OAuth 页显示应用名 `aurocreator`，同意页语言选择 English。应用界面也建议使用英文，便于审核阅读。
- 列出本次项目所有相关 OAuth 客户端及授权流程；有单独 Google 登录和 Gmail 授权时，两条流程均应展示。不能用一个客户端的成功替代其他客户端。
- 准备专用发件账号、受控收件邮箱和干净测试客户。请用 test-message.txt 的虚构内容。
- 页面中的草稿、修改、确认和发送必须实际实现。按钮名以真实界面为准。
- 不展示客户隐私、密码、客户端密钥、授权码、访问令牌或后台环境文件。Client ID 可用于核对身份，与 Client Secret 不同。
- 若出现测试应用尚未验证的 Google 提示，保留真实提示画面；由账号持有人决定并完成授权操作。
- 如系统出现录屏权限请求，由用户确认系统权限后开始。

## 推荐录制设置

使用 macOS 自带截图工具（Shift + Command + 5），选择录制选定区域，框选完整浏览器窗口与地址栏。建议 1920×1080 或保证文字清楚可读的相近尺寸，正常鼠标速度。旁白可以直接朗读下表英文，或将这些文本做成英文字幕。

保留授权页面与发送关键步骤的连续操作。允许剪去单纯等待，但用字幕说明省略等待；不能用剪辑制造未发生的成功状态。不要用产品宣传动画、PPT、代码片段或模拟页面替代授权和发信的真实操作。

## 主视频：真实发送一封邮件

| 建议时间 | 屏幕操作与必须可见的内容 | 英文旁白草稿 |
|---|---|---|
| 00:00–00:15 | 展示测试部署地址和工作区。画面注明 Test account / Test environment。 | This is aurocreator, a workspace assistant for customer communication. This recording uses a test account and a controlled recipient mailbox. I will demonstrate how the user authorizes Gmail sending and sends an approved customer email. |
| 00:15–00:40 | 如应用有独立 Google 登录，展示从登录按钮到返回应用的过程；展示请求的身份权限，不口述未出现的步骤。 | First, I sign in to the application. The identity permissions associate this Google account with the application user. These permissions do not allow email sending. |
| 00:40–01:15 | 从应用连接入口开始 Gmail 授权。显示应用名、实际 Client ID、完整英文同意页、发送权限、其他实际请求范围和返回应用的过程。需要多个授权步骤时分别展示。 | I now enable Gmail sending from inside the application. The consent screen identifies aurocreator and explains the requested sending permission. I review the permissions and grant access using the test account. |
| 01:15–01:50 | 在助手对话输入 test-message.txt 中的请求，使用受控收件地址。真实生成可编辑邮件预览，展示发件账号、收件地址、主题和正文。 | I ask the assistant to prepare a short customer follow-up. The application shows the sender, recipient, subject and message for review. Preparing this message has not sent an email. |
| 01:50–02:10 | 将正文中的 Tuesday 改为 Wednesday，展示最终内容。保持鼠标离开发送按钮，证明用户有编辑机会。 | I change the proposed meeting day to Wednesday and review the final message. The user controls the content before authorizing the external action. |
| 02:10–02:35 | 点击真实发送控件一次；展示排队、处理中、供应商响应等真实状态。不要把接受请求说成送达。 | I explicitly confirm sending this message. The backend submits the approved email through Gmail users.messages.send. The status shown here reflects the response actually returned by the application. |
| 02:35–03:05 | 切到发件账号的 Gmail 网页查看 Sent，找到相同主题、收件人和最终正文。再切到受控收件邮箱显示实际收到的邮件。未收到时如实等待或标注，不伪造。 | I am now checking the sender's Gmail website directly. The sent message has the same recipient and the final Wednesday wording. I also check the controlled recipient mailbox to verify that this test message arrived. This manual check does not give aurocreator inbox-reading access. |
| 03:05–03:25 | 回到应用，展示实际存在的发送记录和连接控制。若发送记录或撤销控件未实现，先补功能或调整文案，不能用静态画面替代。 | Back in aurocreator, the application retains the result of this user-approved action. The gmail.send permission is used for sending. It does not itself grant permission to read, delete or modify mailbox messages. |
| 03:25–03:40 | 停在最终状态，显示简短用途字幕。 | Gmail sending is necessary because identity and read-only permissions cannot send the customer's message. Broader mailbox-management permissions are unnecessary for this sending function. |

以上旁白的现在时仅能配合实际完成的镜头使用。若实际结果不同，应重新录制或改成如实描述。

## 如演示还包括读取、分析或真正的邮件线程回复

主脚本仅覆盖发送。当前申报页没有 gmail.readonly，因此不要录一个读取 Inbox 的流程却声称只用发送权限。

确定本次要申报读取能力后，应补充与实际客户端一致的范围和说明，并加镜头：
1. 在英文同意页展示真实读取权限。
2. 用虚构测试邮件演示接收、摘要和处理建议。
3. 如支持线程回复，从原邮件进入回复，发送后在 Gmail 核对线程与收件人。
4. 说明正文为什么必需；metadata 无法提供正文，send 无法读取邮件。

这部分需按真实功能制作，当前不应当作已实现事实提交。

## YouTube 标题与说明模板

标题：
aurocreator - Gmail Send OAuth Verification Demo

说明模板（录完后填入真实值和时间）：
Application: aurocreator
Google Cloud project: topzeal-2020
Demonstrated OAuth client IDs: [actual client IDs]
Environment: [actual test deployment URL]
Sensitive scope demonstrated: https://www.googleapis.com/auth/gmail.send
Identity scopes demonstrated: [list only those actually shown]

Chapters:
[actual timestamp] Application and account sign-in
[actual timestamp] Gmail OAuth consent
[actual timestamp] User reviews and edits the message
[actual timestamp] User confirms sending
[actual timestamp] Gmail Sent and controlled recipient verification

This video uses test data and controlled mailboxes.

## 成片和提交

1. 先观看导出录像，逐项核对实际 scope、Client ID、品牌和实际发送结果。
2. 建议上传 YouTube，设置为 Unlisted（不公开列出），并确保审核人员可以直接打开；这是交付建议，不是必须公开发布。
3. 在未登录浏览器中验证链接可播放，文字和同意页可读。
4. 将真实链接填入 Google 表单的 YouTube 字段。当前没有视频链接，不能填示例地址。
5. 所有正式版说明与演示一致后，使用 scope-justification-after-implementation-en.txt，保存并进行审核提交。

## 完成清单

- [ ] 发信功能实际实现，授权和确认边界可演示。
- [ ] 项目与 OAuth 客户端对应关系已核对。
- [ ] 授权页与申报范围一致。
- [ ] 已实际录制所有相关授权流程。
- [ ] 已展示最终内容、明确发送操作和实际结果。
- [ ] 已核验受控收件邮箱。
- [ ] 已导出并完整观看成片。
- [ ] 已取得可访问的 YouTube 链接。
- [ ] 已将与实际功能一致的正式说明和视频链接保存到 Google。

