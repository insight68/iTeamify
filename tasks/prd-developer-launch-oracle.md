---
title: Launch Oracle - Single URL Launch Fortune PRD
type: feat
date: 2026-08-28
topic: developer-launch-oracle
status: approved-in-progress
execution: vertical-slice
scope: p0-single-url-public-web-viral-loop
decision-set: user-confirmed-a-a-a-a
---

# PRD：Launch Oracle · 单网址开发者发布黄历

## 1. Introduction / Overview

Launch Oracle 是一个无需注册的公开营销工具。用户只粘贴一个公开项目网站或 GitHub 仓库网址，系统读取有限的公开信息，自动识别项目名称、项目来源、主要语言和可判断的技术栈，然后生成当天的发布建议、行动清单、未来七日最佳发布日期和可分享图片。

本次改版替换原有“产品名＋技术栈＋发布平台”三项输入。产品的关键惊喜从“用户填写信息后看到玄学结果”变为：

> 我只贴了一个链接，它就认出了我的项目，还给了一个挺准、挺损、值得分享的发布建议。

所有操作说明必须使用普通人能立即理解的语言。幽默只出现在结果内容中，不再使用“发布祭坛、技术栈相面、今日病历、最不坏日期”等需要解码的界面文案。

## 2. Goals

- 首屏只出现一个项目网址输入框和一个主按钮。
- 用户无需注册、登录 GitHub 或授权第三方账号。
- 支持公开项目网站和公开 GitHub 仓库。
- 从提交到结果通常不超过 6 秒，分析动画至少展示约 2.7 秒以保留仪式感。
- 同一 `fortune_v2` 版本下，相同规范化网址和日期得到相同运势等级、七日分数和签名。
- 自动识别失败时不追加输入字段；使用规范化域名或 GitHub 仓库路径继续生成通用结果，并明确提示“公开信息有限”。
- 结果首屏能直接回答“今天适不适合发布”。
- 保留 16:9、4:3 分享卡和 README Badge，但 Badge 收入折叠区域，不抢占主要任务。
- 不新增数据库、LLM、用户历史、收藏、管理页或跨业务模块依赖。

## 3. User Stories

### US-001：只粘贴一个网址

**Description:** 作为准备发布的开发者，我只想粘贴项目网址，以便系统替我识别其余信息。

**Acceptance Criteria:**

- [ ] 首屏没有产品名称、技术栈或发布平台输入。
- [ ] 输入接受带协议和不带协议的公开网址。
- [ ] URL 长度不超过 2048 字符。
- [ ] 客户端在明显非法输入时直接提示，不发出分析请求。
- [ ] 中文主按钮为“算一下今天能不能发”。
- [ ] 英文主按钮为“Check if I should ship”。
- [ ] Typecheck 和 lint 通过。
- [ ] 使用本地浏览器验证桌面和 390px 窄屏。

### US-002：安全读取公开项目信息

**Description:** 作为访客，我希望系统自动读取公开信息，而不要求我授权账号或暴露私有数据。

**Acceptance Criteria:**

- [ ] 新增 `POST /api/public/oracle/analyze`，请求体只有 `{ "url": string }`。
- [ ] 只允许 HTTP/HTTPS，拒绝带用户名或密码的 URL。
- [ ] 拒绝 localhost、内网、回环、链路本地、未指定地址和云元数据目标。
- [ ] DNS 解析、实际拨号和每一次重定向均执行公网地址检查。
- [ ] 最多跟随 3 次重定向，单次请求总超时不超过 8 秒。
- [ ] 最多读取 512 KiB 响应体，不保存原始网页正文。
- [ ] POST 执行同源检查，并使用稳定的匿名 IP 限流桶。
- [ ] 生产环境共享限流不可用时拒绝请求。
- [ ] 不记录 URL 请求体，不新增数据库表。
- [ ] Go 单元测试覆盖 URL 规范化、SSRF 拒绝、重定向、正文上限和异常回退。

### US-003：识别 GitHub 公开仓库

**Description:** 作为 GitHub 项目作者，我希望 Oracle 自动认出仓库和常见技术。

**Acceptance Criteria:**

- [ ] 识别 `github.com/{owner}/{repo}` 并规范化到仓库根地址。
- [ ] 最少返回仓库名、完整仓库路径和描述；可用时返回主要语言、更新时间和技术栈提示。
- [ ] 可用时读取根目录 `package.json`，只解析依赖名称，不返回文件正文。
- [ ] 识别 Next.js、React、Tailwind、Supabase、PostgreSQL、Stripe、Vercel 和 AI/LLM 相关依赖。
- [ ] GitHub 受限、私有或暂时不可达时，根据 `owner/repo` 继续生成通用结果，并标记信息有限。

### US-004：识别普通项目网站

**Description:** 作为独立站作者，我希望 Oracle 从公开首页自动识别项目。

**Acceptance Criteria:**

- [ ] 解析 HTML title、description、Open Graph 和 generator 元数据。
- [ ] 识别明显的 Next.js、React、Tailwind、Nuxt、WordPress、Shopify、Webflow 和 Vercel 信号。
- [ ] 不执行页面脚本、不抓取站内第二层链接。
- [ ] 页面不可达或阻止访问时，以安全主机名作为项目名并标记信息有限。

### US-005：生成稳定的单网址运势

**Description:** 作为访客，我希望每天看到稳定、容易理解又有梗的发布建议。

**Acceptance Criteria:**

- [ ] 运势种子使用 `fortune_v2 + 规范化网址 + 日期`，不依赖会变化的 Stars 或描述。
- [ ] 识别结果只决定个性化文案，不改变同一天的核心分数。
- [ ] 结果等级为“放心发 / 可以发 / 再检查一下 / 建议等等 / 今天别发”。
- [ ] 结果包含一句结论、3 项“今天适合做”、3 项“今天先别做”和未来七日最佳日期。
- [ ] 显示 3–5 条系统实际识别到的公开事实。
- [ ] 不声称检测到第三方平台的实时健康状态。

### US-006：精简分享和 README Badge

**Description:** 作为 Build in Public 用户，我希望快速分享结果，而不被设置项打断。

**Acceptance Criteria:**

- [ ] 结果后主操作为“生成分享卡”。
- [ ] 保留 16:9 和 4:3 PNG、下载和复制配文。
- [ ] 分享卡显示项目名、安全主机名、结论、1 项宜、1 项忌和最佳日期。
- [ ] 分享卡与二维码不包含原始查询参数或片段。
- [ ] README Badge 位于折叠区域，默认技术栈来自自动识别结果。
- [ ] Web Share 不支持时回退为下载图片和复制文案。

## 4. Functional Requirements

- **FR-1:** 页面只有一个必填字段“项目链接”。
- **FR-2:** 客户端把无协议域名补为 HTTPS 后提交。
- **FR-3:** 服务端返回 `source_kind`、`canonical_url`、`project_name`、`hostname`、`description`、`primary_language`、`stack_hints`、`updated_at` 和 `limited`。
- **FR-4:** 前端必须使用 schema 解析 API 响应；畸形响应显示稳定错误，不使用类型断言绕过。
- **FR-5:** 分析动画依次显示“读取公开信息、识别技术、计算发布建议”。
- **FR-6:** 网络分析与最短动画并行，不为动画串行增加额外等待。
- **FR-7:** 有效但不可读取的公开网址返回 `limited=true` 的成功结果；非法或不安全网址返回 400。
- **FR-8:** 运势生成继续在浏览器执行，服务端只返回公开项目分析。
- **FR-9:** 原有双语路由、SEO、sitemap、保留 slug 和 Auro CTA 保持不变。
- **FR-10:** 不创建管理页面。

## 5. Design Direction

视觉方向为“极简发布判决书”：保留黑曜石服务器祭坛作为唯一记忆点，但移除坐标、版本号、供奉编号和密集仪表盘语言。

页面结构固定为：

1. 标题＋一句说明。
2. 单个超大 URL 输入条。
3. 三步分析动画。
4. 大号结果判决。
5. 识别依据。
6. 3 项建议＋3 项提醒。
7. 七日最佳日期。
8. 分享动作。
9. 折叠的 README Badge。
10. Auro 次级 CTA。

中文界面标签尽量不超过 8 个汉字，说明句尽量不超过 30 个汉字。英文标签使用正常大小写，不再大面积使用全大写。

## 6. Technical Considerations

- Go 服务复用现有 `middleware.RateLimitClass` 和可信代理解析；生产使用 `RateLimitClassStrict`。
- URL 抓取使用独立、无系统代理的 HTTP Transport；拨号时直接连接已经验证的公网 IP，降低 DNS rebinding 风险。
- 使用 `golang.org/x/net/html` 解析有限 HTML，不引入浏览器或脚本执行环境。
- 可使用最多 15 分钟、最多 256 项的进程内结构化结果缓存；缓存不包含网页正文。
- GitHub API 是增强信息来源，不是成功前提；限流或失败必须回退。
- 前端 API 模块位于 Oracle feature 内，不进入共享业务客户端或 React Query。
- API 不接受 locale；语言本地化完全在客户端完成。

## 7. Non-Goals

- 不支持私有 GitHub 仓库或登录授权。
- 不支持 GitLab、Product Hunt 或任意文档页面的专用解析。
- 不使用 LLM 总结 README 或生成结果。
- 不抓取整个网站、站内页面或执行 JavaScript。
- 不保存查询历史，不生成可恢复的项目 ID。
- 不建设 Dashboard、运营后台、排行榜、收藏或社区。
- 不保证准确识别所有技术栈。

## 8. Success Metrics

- 首屏字段数从 3 降为 1。
- 用户首次提交所需操作不超过一次粘贴和一次点击。
- 有效公开 URL 的结果成功率达到 95%，其中允许 `limited=true` 回退。
- 50% 以上成功结果能识别项目名之外至少一项公开信号。
- 分享按钮点击率不低于结果曝光用户的 15%。
- Oracle 到 Auro CTA 点击率可单独通过现有 UTM 归因，不新增用户跟踪。

## 9. Rollout / Verification

- Go：分析器与 handler 单元测试，聚焦 SSRF、上限、回退和 schema。
- Web：API schema、运势确定性、单输入交互、分享卡和路由边界测试。
- E2E：拦截分析接口，验证英文、中文、PNG 下载、无注册和减弱动效。
- Browser：桌面、390px、长项目名、limited 回退、API 错误。
- Build：Web 生产构建与聚焦 Go package 测试。
- Production canary：分别使用公开 GitHub 仓库、普通网站、不可抓取网站和恶意内网 URL；未执行前不得声明生产验收完成。
