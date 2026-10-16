# Aurocreator 中文/英文 i18n、品牌与 SEO 实施说明

## 已确认范围

- 组织与网站品牌：`Aurocreator`；视觉字标使用 `aurocreator`。
- AI 产品名：`Auro`。
- 主域名与 canonical origin：`https://aurocreator.com`。
- 核心定位：`Auro — Your AI Business Manager.`
- 核心传播语：`You create. Auro handles the business.`
- 本阶段正式对外语言只有英文与简体中文。
- 英文营销页不加语言前缀；简体中文使用 `/zh-cn`。
- 不保留或迁移旧域名，不实现旧域名重定向和兼容入口。
- 品牌修改只覆盖用户可见内容及公开 URL。
- 内部 `@iteamify/*` 包名、Go module、数据库字段、历史 migration、兼容存储键与环境变量不重命名。

## URL 与 locale 规范

| 语义 | 英文 | 简体中文 |
| --- | --- | --- |
| internal locale | `en` | `zh-Hans` |
| marketing URL | 无前缀 | `/zh-cn` |
| HTML `lang` | `en` | `zh-CN` |
| `hreflang` | `en` | `zh-CN` |
| Open Graph locale | `en_US` | `zh_CN` |

公开营销页映射：

| 页面 | 英文 | 简体中文 |
| --- | --- | --- |
| 首页 | `/` | `/zh-cn` |
| About | `/about` | `/zh-cn/about` |
| Contact sales | `/contact-sales` | `/zh-cn/contact-sales` |
| Download | `/download` | `/zh-cn/download` |

`/en` 与 `/en/*` 永久重定向到无前缀英文 URL；`/homepage` 永久重定向到 `/`，避免重复内容。

营销页 URL 是语言的最终事实源。Cookie 和 `Accept-Language` 只影响无语言语义的产品页面，不能让同一个营销 URL 返回不同正文。

## 已实现架构

### 1. 单一公开品牌配置

`apps/web/config/site.ts` 统一提供站点名、产品名、canonical origin 和默认描述。Metadata、sitemap、robots、JSON-LD 和公开链接复用该配置。

生产公开默认值统一为：

- Web：`https://aurocreator.com`
- API：`https://api.aurocreator.com`
- WebSocket：`wss://api.aurocreator.com/ws`
- 默认发件邮箱：`noreply@aurocreator.com`

### 2. 营销路由 i18n

`apps/web/lib/marketing-i18n.ts` 负责：

- URL 与 locale 的双向映射；
- 页面间语言切换；
- 保留 query 与 hash；
- 仅允许 `en` 和 `zh-Hans`；
- 输出 HTML、hreflang 和 Open Graph 使用的标准 locale。

语言选择器同时出现在营销页头部和页脚。切换语言时导航到当前页面的等价语言 URL，而不是只替换客户端文案。

### 3. 产品 i18n

- Web/desktop 继续复用 `@iteamify/core/i18n` 与 `packages/views/locales`。
- 设置页只向用户提供 English 和中文两个正式选项。
- 历史或区域化 locale 会归一化，选择器始终有有效值。
- 登录验证码请求会携带当前语言。
- 内部仍可保留历史语言资源，不将其发布为当前正式语言。

### 4. 邮件 i18n

以下邮件具有独立英文/中文主题和正文：

- 登录验证码；
- 工作区邀请；
- 公开服务方案/报价确认验证码。

语言通过用户当前界面或邀请者资料传到服务端。服务端只接受英文/简体中文语义，未知值回退英文。所有用户输入继续转义，邮件正文不信任工作区名、邀请者名或卖家名。

### 5. 用户可见品牌

覆盖范围：

- 营销首页、About、Contact sales、Download；
- Web/desktop 产品翻译资源与 onboarding；
- Desktop 与 Mobile 应用显示名称和关键系统提示；
- 登录、邀请、报价邮件；
- CLI 帮助和安装器中的显示名称及公开云 URL；
- README、自托管说明和公开帮助链接。

保留范围：

- `@iteamify/core`、`@iteamify/ui`、`@iteamify/views`；
- `ITEAMIFY_*` 环境变量；
- `iteamify` CLI 命令和兼容存储键；
- Go module、数据库对象、事件字段、协议头和历史 migration。

保留这些内部标识是兼容性边界，不会进入站点品牌、SEO 标题或营销文案。

## SEO 规范

每个营销页面必须输出：

- 自指 canonical；
- 英文、`zh-CN` 和 `x-default` 的 reciprocal hreflang；
- 本地化 title 与 description；
- 本地化 Open Graph locale、title、description 和图片；
- `index,follow`；
- sitemap 中的两个语言 URL 及 alternates。

根布局默认 `noindex,nofollow`，公开营销页显式覆盖为 `index,follow`。这样登录、工作区和动态业务页面不会因为新增路由而意外进入搜索索引。

结构化数据仅声明可验证事实：Organization、WebSite 和 SoftwareApplication。不声明未经确认的价格、评分、客户数量、团队规模、法律实体或社交账号。

## 验收标准

- `/` 与 `/zh-cn` 分别稳定返回英文和中文，不受相反语言 Cookie 影响。
- 四个公开页面都能在英文和中文等价 URL 间切换，并保留 query/hash。
- 页面头部与页脚均可发现语言入口；键盘和读屏器可操作。
- 所有语言页面都有正确 canonical、hreflang、HTML lang 和 OG locale。
- sitemap 只包含真实存在的 8 个营销 URL。
- `/homepage`、`/en` 和 `/en/*` 是单跳 308。
- 用户设置只显示 English 和中文。
- 登录验证码、邀请、公开报价确认邮件能按英文/中文发送。
- 用户可见位置不再出现旧域名或旧品牌；内部兼容标识除外。
- Web、views、core、desktop 类型检查通过。
- 营销路由、Metadata、proxy、登录、语言设置和邮件聚焦测试通过。
- Web 生产构建通过，并对英文/中文首页完成浏览器级视觉与交互检查。

## 后续非本期事项

- 日文、韩文重新进入正式支持前，需要完成翻译质量审计和独立 SEO URL。
- 内部包名、CLI 命令、环境变量和协议标识的品牌化需要独立的版本化兼容项目。
- 新法律页、真实社交账号、Apple Touch Icon 和原生安装包图标应在品牌资产确认后单独补充。
