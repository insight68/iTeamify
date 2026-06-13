# 首页重构实现计划：AI 业财对账平台转型

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Teamify 首页从 AI 任务管理平台转型为电商 AI 业财对账平台，包含全新品牌配色、AI 人格化设计、量化价值主张。

**Architecture:** 保持现有组件结构，主要修改内容层（i18n 文案）和样式层（品牌色变量）。新增"对话演示"组件替换原角色轮播。

**Tech Stack:** React/Next.js (App Router), Tailwind CSS, shadcn/ui, react-i18next, TypeScript

---

## 文件结构

### 新建文件
| 文件路径 | 职责 |
|---|---|
| `packages/views/marketing/chat-demo-section.tsx` | 对话式操作演示组件 |
| `packages/views/marketing/testimonials-section.tsx` | 客户证言组件（从 FAQ 中分离） |
| `packages/public/logo/suanpan-icon.svg` | 算盘 Logo SVG |

### 修改文件
| 文件路径 | 修改范围 |
|---|---|
| `packages/ui/styles/base.css` | 更新 `--brand` 颜色变量 |
| `packages/views/marketing/landing-page.tsx` | 调整组件顺序，插入新组件 |
| `packages/views/marketing/hero-section.tsx` | 重写布局和文案引用 |
| `packages/views/marketing/agent-role-cards.tsx` | 重命名为 `feature-cards.tsx`，更新内容 |
| `packages/views/marketing/comparison-section.tsx` | 更新对比数据（通过 i18n） |
| `packages/views/marketing/pricing-section.tsx` | 更新定价结构（通过 i18n） |
| `packages/views/marketing/faq-section.tsx` | 更新 FAQ 内容（通过 i18n） |
| `packages/views/marketing/cta-section.tsx` | 更新 CTA 文案（通过 i18n） |
| `packages/views/marketing/nav.tsx` | 更新导航文案（通过 i18n） |
| `packages/views/marketing/footer.tsx` | 更新页脚文案（通过 i18n） |
| `packages/views/locales/en/marketing.json` | 完全重写英文文案 |
| `packages/views/locales/zh-Hans/marketing.json` | 完全重写中文文案 |

---

## Task 1: 更新品牌色变量

**Files:**
- Modify: `packages/ui/styles/base.css`

- [ ] **Step 1: 定位当前品牌色定义**

查找 `packages/ui/styles/base.css` 中的 `--brand` 颜色变量。

- [ ] **Step 2: 更新品牌色为青碧色**

```css
/* 替换原有的 --brand 定义 */
--brand: 214 100% 40%; /* hsl(214, 100%, 40%) ≈ #008F82 */
--brand-foreground: 0 0% 100%;
```

- [ ] **Step 3: 保存并验证**

运行: `pnpm dev:web`，访问首页，确认品牌色已更新为青色系。

- [ ] **Step 4: Commit**

```bash
git add packages/ui/styles/base.css
git commit -m "feat(brand): update brand color to teal #008F82 for suanpan positioning"
```

---

## Task 2: 创建对话演示组件

**Files:**
- Create: `packages/views/marketing/chat-demo-section.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
"use client";

import { useT } from "../i18n";

/**
 * Chat-based operation demo showing how suanpan AI
 * handles reconciliation through natural conversation.
 */
export function ChatDemoSection() {
  const { t } = useT("marketing");

  const messages = [
    { role: "user" as const, text: t(($) => $.chat_demo.messages.user_1) },
    { role: "assistant" as const, text: t(($) => $.chat_demo.messages.assistant_1) },
    { role: "assistant" as const, text: t(($) => $.chat_demo.messages.assistant_2) },
  ];

  return (
    <section
      id="chat-demo"
      aria-labelledby="chat-demo-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.chat_demo.eyebrow)}
          </p>
          <h2
            id="chat-demo-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.chat_demo.heading)}
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            {t(($) => $.chat_demo.subtitle)}
          </p>
        </div>
        <div className="mt-12">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card p-6 shadow-lg md:p-8">
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <span className="mr-2 font-semibold">算盘</span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center text-xs text-muted-foreground">
              {t(($) => $.chat_demo.footer_note)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 导出新组件**

在 `packages/views/marketing/index.ts` 中添加导出：

```typescript
export { ChatDemoSection } from "./chat-demo-section";
```

- [ ] **Step 3: Commit**

```bash
git add packages/views/marketing/chat-demo-section.tsx packages/views/marketing/index.ts
git commit -m "feat(marketing): add chat demo section for AI conversation showcase"
```

---

## Task 3: 创建客户证言组件

**Files:**
- Create: `packages/views/marketing/testimonials-section.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
"use client";

import { useT } from "../i18n";

const TESTIMONIAL_KEYS = ["live_stream", "multi_platform", "agency"] as const;

/**
 * Customer testimonials organized by industry segment.
 * Each testimonial includes role, company, and specific results.
 */
export function TestimonialsSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.testimonials.eyebrow)}
          </p>
          <h2
            id="testimonials-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.testimonials.heading)}
          </h2>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {TESTIMONIAL_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-8"
            >
              <div className="mb-4 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                {t(($) => $.testimonials.items[key].segment)}
              </div>
              <blockquote className="mb-4 text-sm leading-relaxed text-muted-foreground">
                "{t(($) => $.testimonials.items[key].quote)}"
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {t(($) => $.testimonials.items[key].author_initial)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t(($) => $.testimonials.items[key].author)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(($) => $.testimonials.items[key].role)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 导出新组件**

在 `packages/views/marketing/index.ts` 中添加导出。

- [ ] **Step 3: Commit**

```bash
git add packages/views/marketing/testimonials-section.tsx
git commit -m "feat(marketing): add testimonials section with industry segments"
```

---

## Task 4: 重写 Hero 组件

**Files:**
- Modify: `packages/views/marketing/hero-section.tsx`

- [ ] **Step 1: 备份并重写 Hero 组件**

完全替换 `hero-section.tsx` 内容为：

```typescript
"use client";

import { useMemo } from "react";
import { ArrowRight, BarChart3 } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Hero section with quantitative value proposition, chat demo preview,
 * stat badges, and dual CTAs. Suapan (AI accountant) branding.
 */
export function HeroSection() {
  const { t, i18n } = useT("marketing");

  const stats = useMemo(() => [
    t(($) => $.hero.stats.platforms),
    t(($) => $.hero.stats.merchants),
    t(($) => $.hero.stats.accuracy),
  ], [t]);

  return (
    <section className="relative overflow-hidden">
      {/* Dot-grid pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `radial-gradient(circle, color-mix(in oklab, var(--brand) 12%, transparent) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
      />
      {/* Soft gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--brand)_12%,transparent),transparent_60%)]"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-8 pt-16 md:px-6 md:pt-24 lg:pb-12 lg:pt-32">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 inline-flex w-fit items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t(($) => $.hero.eyebrow)}
          </span>
          <h1 className="font-serif text-4xl font-normal leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            {t(($) => $.hero.headline)}
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl">
            {t(($) => $.hero.sub_headline)}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <AppLink
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(($) => $.hero.primary_cta)}
              <ArrowRight className="size-4" aria-hidden />
            </AppLink>
            <AppLink
              href="#testimonials"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <BarChart3 className="size-4" aria-hidden />
              {t(($) => $.hero.secondary_cta)}
            </AppLink>
          </div>
        </div>

        {/* Chat demo preview */}
        <div className="mt-12 md:mt-16">
          <div className="mx-auto max-w-lg">
            <div className="rounded-xl border border-border/60 bg-card p-4 shadow-lg ring-1 ring-foreground/5">
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-brand px-4 py-2.5 text-sm text-brand-foreground">
                    {t(($) => $.hero.chat_preview.user)}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
                    <span className="font-semibold">算盘</span>: {t(($) => $.hero.chat_preview.assistant)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stat badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {stats.map((stat, i) => (
            <StatBadge key={i} label={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/views/marketing/hero-section.tsx
git commit -m "feat(marketing): rewrite hero section for suanpan AI accountant positioning"
```

---

## Task 5: 重命名并重写功能卡片组件

**Files:**
- Modify: `packages/views/marketing/agent-role-cards.tsx` → `packages/views/marketing/feature-cards.tsx`

- [ ] **Step 1: 创建新的 feature-cards.tsx**

```typescript
"use client";

import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { useT } from "../i18n";

const FEATURE_KEYS = [
  "order_reconciliation",
  "fee_verification",
  "profit_analysis",
  "anomaly_monitoring",
] as const;

const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  order_reconciliation: RefreshCw,
  fee_verification: DollarSign,
  profit_analysis: TrendingUp,
  anomaly_monitoring: ShieldAlert,
};

/**
 * 4 core capability cards in responsive grid.
 * Replaces agent roles with feature-focused cards.
 */
export function FeatureCards() {
  const { t } = useT("marketing");

  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.features.eyebrow)}
          </p>
          <h2
            id="features-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.features.heading)}
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_KEYS.map((key) => {
            const Icon = FEATURE_ICONS[key]!;
            return (
              <div
                key={key}
                className="group rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_0_20px_color-mix(in_oklab,var(--brand)_12%,transparent)]"
              >
                <span className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {t(($) => $.features.items[key].title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(($) => $.features.items[key].description)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 删除旧文件**

```bash
rm packages/views/marketing/agent-role-cards.tsx
```

- [ ] **Step 3: 更新 index.ts 导出**

修改 `packages/views/marketing/index.ts`，移除 `AgentRoleCards` 导出，添加 `FeatureCards`。

- [ ] **Step 4: Commit**

```bash
git add packages/views/marketing/
git commit -m "feat(marketing): replace agent-role-cards with feature-cards"
```

---

## Task 6: 更新首页组件顺序

**Files:**
- Modify: `packages/views/marketing/landing-page.tsx`

- [ ] **Step 1: 更新组件导入和顺序**

```typescript
"use client";

import { LandingNav } from "./nav";
import { HeroSection } from "./hero-section";
import { FeatureCards } from "./feature-cards";
import { IntegrationsSection } from "./integrations-section";
import { ChatDemoSection } from "./chat-demo-section";
import { ComparisonSection } from "./comparison-section";
import { TestimonialsSection } from "./testimonials-section";
import { PricingSection } from "./pricing-section";
import { FaqSection } from "./faq-section";
import { CtaSection } from "./cta-section";
import { LandingFooter } from "./footer";

/**
 * Composed marketing page for suanpan AI accountant platform.
 */
export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <FeatureCards />
        <IntegrationsSection />
        <ChatDemoSection />
        <ComparisonSection />
        <TestimonialsSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/views/marketing/landing-page.tsx
git commit -m "feat(marketing): update landing page component order"
```

---

## Task 7: 重写中文文案

**Files:**
- Modify: `packages/views/locales/zh-Hans/marketing.json`

- [ ] **Step 1: 完全替换中文文案**

```json
{
  "nav": {
    "features": "功能",
    "integrations": "集成",
    "chat_demo": "对话演示",
    "comparison": "对比",
    "testimonials": "用户评价",
    "pricing": "价格",
    "faq": "常见问题",
    "sign_in": "登录",
    "sign_up": "免费试用"
  },
  "hero": {
    "eyebrow": "电商专用的 AI 对账工具",
    "headline": "月度对账，从 3 天到 30 分钟",
    "sub_headline": "算盘自动化 94% 的对账工作。零漏单、零差错。",
    "primary_cta": "免费试用 — 上传第一个订单",
    "secondary_cta": "看看真实案例",
    "stats": {
      "platforms": "12+ 电商平台支持",
      "merchants": "5,000+ 商家正在使用",
      "accuracy": "准确率 99.9%"
    },
    "chat_preview": {
      "user": "帮我对一下上月抖音店铺的订单和到账",
      "assistant": "已核对 2,847 笔订单，发现 3 笔异常，需要我详细说明吗？"
    }
  },
  "features": {
    "eyebrow": "算盘能做什么",
    "heading": "4 大核心能力，搞定电商对账",
    "items": {
      "order_reconciliation": {
        "title": "订单对账",
        "description": "多平台订单自动匹配，从天猫到抖音，一个不少。"
      },
      "fee_verification": {
        "title": "费用核对",
        "description": "平台佣金、推广费、物流费，逐笔核对不漏。"
      },
      "profit_analysis": {
        "title": "利润分析",
        "description": "自动计算店铺真实利润，一眼看清赚了多少。"
      },
      "anomaly_monitoring": {
        "title": "异常监控",
        "description": "24/7 监控差异，漏单、错账第一时间提醒。"
      }
    }
  },
  "integrations": {
    "eyebrow": "全平台覆盖",
    "heading": "连接你卖货的所有平台",
    "tools": {
      "taobao": "淘宝/天猫",
      "douyin": "抖音电商",
      "pinduoduo": "拼多多",
      "jd": "京东",
      "kuaishou": "快手",
      "xiaohongshu": "小红书",
      "weishop": "微信小店",
      "bilibili": "哔哩哔哩",
      "shopify": "Shopify",
      "amazon": "亚马逊",
      "lazada": "Lazada",
      "shopee": "Shopee"
    }
  },
  "chat_demo": {
    "eyebrow": "用对话，完成对账",
    "heading": "不懂 Excel，不用学。你会说话，就会用算盘。",
    "subtitle": "90% 的对账工作，用自然语言就能完成",
    "footer_note": "算盘是 24/7 待命的 AI 对账搭档，从不会累，从不会错。",
    "messages": {
      "user_1": "帮我查下为什么上月利润下降了？",
      "assistant_1": "上月利润下降 12%。正在分析原因...",
      "assistant_2": "发现 3 个主要原因：\n1. 抖音佣金率从 15% 涨到 18%，多支出 ¥4,200\n2. 退货率上升 3%，损失 ¥2,100\n3. 物流费用增加 ¥1,500\n需要我导出详细明细吗？"
    }
  },
  "comparison": {
    "eyebrow": "为什么选算盘",
    "heading": "不是 Excel，不是财务软件，是懂电商的 AI",
    "columns": {
      "suanpan": "算盘",
      "manual": "人工",
      "excel": "Excel",
      "software": "财务软件"
    },
    "rows": {
      "monthly_time": {
        "label": "月度耗时",
        "suanpan": "30分钟",
        "manual": "3天",
        "excel": "1天",
        "software": "2天"
      },
      "auto_match": {
        "label": "自动匹配",
        "suanpan": "94%",
        "manual": "0%",
        "excel": "需要公式",
        "software": "60%"
      },
      "missing_rate": {
        "label": "漏单率",
        "suanpan": "0%",
        "manual": "5%",
        "excel": "10%",
        "software": "3%"
      },
      "alert_speed": {
        "label": "异常提醒",
        "suanpan": "实时",
        "manual": "月底",
        "excel": "需自查",
        "software": "滞后"
      },
      "monthly_cost": {
        "label": "月度成本",
        "suanpan": "¥199起",
        "manual": "¥5,000+",
        "excel": "免费",
        "software": "¥2,000+"
      }
    }
  },
  "testimonials": {
    "eyebrow": "5,000+ 商家正在使用",
    "heading": "他们用算盘，把对账变成了 30 分钟的事",
    "items": {
      "live_stream": {
        "segment": "直播电商",
        "quote": "以前月底对账要熬通宵，现在算盘 30 分钟就搞定。异常订单还自动标出来，省心太多了。",
        "author": "李先生",
        "author_initial": "李",
        "role": "抖音美妆店，月 GMV ¥80 万"
      },
      "multi_platform": {
        "segment": "多平台卖家",
        "quote": "淘宝+抖音+拼多多，三个平台的对账以前是个噩梦。算盘统一管理，再也不用切来切去了。",
        "author": "王女士",
        "author_initial": "王",
        "role": "服装电商，4 平台同步运营"
      },
      "agency": {
        "segment": "代运营公司",
        "quote": "我们管理 15 家店铺，算盘批量对账，每家 5 分钟出报告。客户都说我们专业度高了不少。",
        "author": "赵总",
        "author_initial": "赵",
        "role": "电商代运营，服务 15+ 品牌"
      }
    }
  },
  "pricing": {
    "heading": "简单、透明的定价",
    "subtitle": "免费试用 14 天，满意再付费",
    "tiers": {
      "free": {
        "name": "免费试用",
        "price": "¥0",
        "period": "14天",
        "description": "体验算盘的全部核心功能",
        "features": [
          "1 个店铺绑定",
          "1,000 笔订单对账",
          "基础对账报告",
          "邮件支持"
        ],
        "cta": "开始试用"
      },
      "pro": {
        "name": "专业版",
        "price": "¥199",
        "period": "/店铺/月",
        "description": "适合成长中的电商卖家",
        "features": [
          "5 个店铺绑定",
          "无限订单对账",
          "高级利润分析",
          "API 接口",
          "优先技术支持"
        ],
        "cta": "开始试用"
      },
      "enterprise": {
        "name": "企业版",
        "price": "定制",
        "period": "",
        "description": "适合大型团队和代运营公司",
        "features": [
          "无限店铺绑定",
          "定制功能开发",
          "专属客户经理",
          "私有部署选项",
          "SLA 保障"
        ],
        "cta": "联系销售"
      }
    }
  },
  "faq": {
    "heading": "常见问题",
    "items": {
      "platforms": {
        "question": "支持哪些电商平台？",
        "answer": "支持淘宝/天猫、抖音电商、拼多多、京东、快手、小红书、微信小店、哔哩哔哩、Shopify、亚马逊、Lazada、Shopee 等 12+ 平台，持续增加中。"
      },
      "security": {
        "question": "数据安全吗？",
        "answer": "我们采用银行级 AES-256 加密，通过 ISO27001 安全认证。你的数据仅用于对账服务，绝不外泄，可随时导出删除。"
      },
      "learning": {
        "question": "不会用怎么办？",
        "answer": "不用学。会上网、会打字，就会用算盘。第一次使用有引导教程，遇到问题随时联系客服，我们会在 10 分钟内响应。"
      },
      "payment": {
        "question": "支持哪些支付方式？",
        "answer": "支持支付宝、微信支付、企业对公转账。企业版支持年付优惠，具体请联系销售。"
      },
      "refund": {
        "question": "可以退款吗？",
        "answer": "专业版和企业版均支持 7 天无理由退款。只要对账数据未产生，即可申请全额退款。"
      },
      "api": {
        "question": "有 API 接口吗？",
        "answer": "专业版及以上提供 REST API 接口，支持订单数据推送、对账结果查询、webhook 回调等功能。"
      },
      "contract": {
        "question": "需要签合同吗？",
        "answer": "企业版需要签署正式合同，可开具增值税专用发票。专业版可直接在线购买，发票在订单完成后开具。"
      },
      "compare": {
        "question": "和代账公司有什么区别？",
        "answer": "算盘是自动化工具，不是人工服务。我们帮你把 90% 的对账工作自动化，剩下的 10% 复杂情况你可以自己处理或找代账公司确认。很多代账公司也在用算盘提高效率。"
      }
    }
  },
  "cta": {
    "heading": "第一次对账，30 分钟搞定",
    "body": "上传你的第一个订单，让算盘开始工作。免费试用 14 天，满意再付费。",
    "button": "免费试用 — 无需信用卡"
  },
  "footer": {
    "brand_blurb": "算盘，你的 24/7 AI 对账搭档。每笔订单、每分钱、对得清清楚楚。",
    "marquee": {
      "row1": {
        "phrase_1": "自动匹配 94%",
        "phrase_2": "零漏单保证",
        "phrase_3": "12+ 平台",
        "phrase_4": "24/7 监控",
        "phrase_5": "30 分钟完成",
        "phrase_6": "准确率 99.9%",
        "phrase_7": "实时异常提醒",
        "phrase_8": "无需学 Excel"
      },
      "row2": {
        "phrase_1": "免费试用 14 天",
        "phrase_2": "从 ¥199/月",
        "phrase_3": "API 接口",
        "phrase_4": "私有部署",
        "phrase_5": "银行级加密",
        "phrase_6": "ISO27001",
        "phrase_7": "7 天退款",
        "phrase_8": "随时导出"
      }
    },
    "columns": {
      "product": {
        "title": "产品",
        "links": {
          "features": "功能",
          "how_it_works": "使用方式",
          "pricing": "价格",
          "changelog": "更新日志"
        }
      },
      "resources": {
        "title": "资源",
        "links": {
          "docs": "文档",
          "blog": "博客",
          "api": "API 文档",
          "github": "GitHub"
        }
      },
      "company": {
        "title": "公司",
        "links": {
          "about": "关于我们",
          "contact": "联系我们",
          "careers": "招聘",
          "privacy": "隐私政策"
        }
      },
      "legal": {
        "title": "法律",
        "links": {
          "terms": "服务条款",
          "privacy": "隐私政策",
          "license": "许可证"
        }
      }
    },
    "copyright": "© {{year}} 算盘. 基于对账，不止于对账。"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/views/locales/zh-Hans/marketing.json
git commit -m "feat(i18n): rewrite zh-Hans marketing copy for suanpan AI accountant"
```

---

## Task 8: 重写英文文案

**Files:**
- Modify: `packages/views/locales/en/marketing.json`

- [ ] **Step 1: 完全替换英文文案**

```json
{
  "nav": {
    "features": "Features",
    "integrations": "Integrations",
    "chat_demo": "Chat Demo",
    "comparison": "Compare",
    "testimonials": "Testimonials",
    "pricing": "Pricing",
    "faq": "FAQ",
    "sign_in": "Sign in",
    "sign_up": "Start free trial"
  },
  "hero": {
    "eyebrow": "AI reconciliation for e-commerce",
    "headline": "Reconcile monthly accounts in 30 minutes, not 3 days",
    "sub_headline": "Suanpan automates 94% of reconciliation work. Zero missing orders, zero errors.",
    "primary_cta": "Start free trial — upload first order",
    "secondary_cta": "See real results",
    "stats": {
      "platforms": "12+ marketplaces supported",
      "merchants": "5,000+ merchants using suanpan",
      "accuracy": "99.9% accuracy rate"
    },
    "chat_preview": {
      "user": "Help me reconcile last month's Douyin orders with payments",
      "assistant": "Reconciled 2,847 orders, found 3 anomalies. Need me to explain?"
    }
  },
  "features": {
    "eyebrow": "What suanpan does",
    "heading": "4 core capabilities that handle e-commerce reconciliation",
    "items": {
      "order_reconciliation": {
        "title": "Order Reconciliation",
        "description": "Auto-match multi-platform orders, from Tmall to Douyin, none left behind."
      },
      "fee_verification": {
        "title": "Fee Verification",
        "description": "Platform commissions, ad spend, shipping fees — verified down to the last cent."
      },
      "profit_analysis": {
        "title": "Profit Analysis",
        "description": "Auto-calculate real store profits. See exactly what you earned at a glance."
      },
      "anomaly_monitoring": {
        "title": "Anomaly Monitoring",
        "description": "24/7 difference monitoring. Missing orders and errors flagged instantly."
      }
    }
  },
  "integrations": {
    "eyebrow": "Full platform coverage",
    "heading": "Connect everywhere you sell",
    "tools": {
      "taobao": "Taobao/Tmall",
      "douyin": "Douyin",
      "pinduoduo": "Pinduoduo",
      "jd": "JD.com",
      "kuaishou": "Kuaishou",
      "xiaohongshu": "Xiaohongshu",
      "weishop": "WeChat Shop",
      "bilibili": "Bilibili",
      "shopify": "Shopify",
      "amazon": "Amazon",
      "lazada": "Lazada",
      "shopee": "Shopee"
    }
  },
  "chat_demo": {
    "eyebrow": "Reconcile through conversation",
    "heading": "No Excel skills needed. If you can type, you can use suanpan.",
    "subtitle": "90% of reconciliation tasks completed through natural language",
    "footer_note": "Suanpan is your 24/7 AI reconciliation partner — never tired, never wrong.",
    "messages": {
      "user_1": "Why did last month's profit drop?",
      "assistant_1": "Last month's profit dropped 12%. Analyzing causes...",
      "assistant_2": "Found 3 main reasons:\n1. Douyin commission rate 15%→18%, extra ¥4,200\n2. Return rate up 3%, lost ¥2,100\n3. Shipping costs increased ¥1,500\nWant me to export the breakdown?"
    }
  },
  "comparison": {
    "eyebrow": "Why suanpan",
    "heading": "Not Excel. Not accounting software. AI that understands e-commerce.",
    "columns": {
      "suanpan": "Suanpan",
      "manual": "Manual",
      "excel": "Excel",
      "software": "Accounting Software"
    },
    "rows": {
      "monthly_time": {
        "label": "Monthly time",
        "suanpan": "30 min",
        "manual": "3 days",
        "excel": "1 day",
        "software": "2 days"
      },
      "auto_match": {
        "label": "Auto-match rate",
        "suanpan": "94%",
        "manual": "0%",
        "excel": "Formulas needed",
        "software": "60%"
      },
      "missing_rate": {
        "label": "Missing order rate",
        "suanpan": "0%",
        "manual": "5%",
        "excel": "10%",
        "software": "3%"
      },
      "alert_speed": {
        "label": "Anomaly alerts",
        "suanpan": "Real-time",
        "manual": "Month-end",
        "excel": "Manual check",
        "software": "Delayed"
      },
      "monthly_cost": {
        "label": "Monthly cost",
        "suanpan": "From ¥199",
        "manual": "¥5,000+",
        "excel": "Free",
        "software": "¥2,000+"
      }
    }
  },
  "testimonials": {
    "eyebrow": "5,000+ merchants using suanpan",
    "heading": "They turned reconciliation from a 3-day nightmare into 30 minutes",
    "items": {
      "live_stream": {
        "segment": "Live Streaming",
        "quote": "I used to pull all-nighters for month-end reconciliation. Now suanpan handles it in 30 minutes. Anomalies are auto-flagged. Life is so much easier.",
        "author": "Mr. Li",
        "author_initial": "L",
        "role": "Douyin beauty store, ¥800k monthly GMV"
      },
      "multi_platform": {
        "segment": "Multi-platform Seller",
        "quote": "Taobao + Douyin + Pinduoduo used to be a nightmare. Suanpan unifies everything across platforms. No more switching back and forth.",
        "author": "Ms. Wang",
        "author_initial": "W",
        "role": "Fashion e-commerce, 4 platforms"
      },
      "agency": {
        "segment": "Agency",
        "quote": "We manage 15 stores. Suanpan batch-reconciles everything — 5 minutes per store for full reports. Clients say we've never been more professional.",
        "author": "Mr. Zhao",
        "author_initial": "Z",
        "role": "E-commerce agency, 15+ brands"
      }
    }
  },
  "pricing": {
    "heading": "Simple, transparent pricing",
    "subtitle": "14-day free trial. Pay only when satisfied.",
    "tiers": {
      "free": {
        "name": "Free Trial",
        "price": "¥0",
        "period": "14 days",
        "description": "Experience all core features",
        "features": [
          "1 store connection",
          "1,000 orders reconciliation",
          "Basic reports",
          "Email support"
        ],
        "cta": "Start trial"
      },
      "pro": {
        "name": "Pro",
        "price": "¥199",
        "period": "/store/month",
        "description": "For growing e-commerce sellers",
        "features": [
          "5 store connections",
          "Unlimited orders",
          "Advanced profit analysis",
          "API access",
          "Priority support"
        ],
        "cta": "Start trial"
      },
      "enterprise": {
        "name": "Enterprise",
        "price": "Custom",
        "period": "",
        "description": "For large teams and agencies",
        "features": [
          "Unlimited stores",
          "Custom features",
          "Dedicated manager",
          "Private deployment",
          "SLA guarantee"
        ],
        "cta": "Contact sales"
      }
    }
  },
  "faq": {
    "heading": "Common questions",
    "items": {
      "platforms": {
        "question": "Which platforms do you support?",
        "answer": "We support Taobao/Tmall, Douyin, Pinduoduo, JD, Kuaishou, Xiaohongshu, WeChat Shop, Bilibili, Shopify, Amazon, Lazada, Shopee, and 12+ platforms. More coming soon."
      },
      "security": {
        "question": "Is my data secure?",
        "answer": "We use bank-grade AES-256 encryption and are ISO27001 certified. Your data is used only for reconciliation, never shared. Export or delete anytime."
      },
      "learning": {
        "question": "What if I don't know how to use it?",
        "answer": "No learning curve. If you can browse the web and type, you can use suanpan. First-time users get a guided tour. Need help? Customer support responds within 10 minutes."
      },
      "payment": {
        "question": "What payment methods do you accept?",
        "answer": "We accept Alipay, WeChat Pay, and bank transfer. Enterprise plans support annual billing with discounts. Contact sales for details."
      },
      "refund": {
        "question": "Can I get a refund?",
        "answer": "Pro and Enterprise plans include a 7-day money-back guarantee. As long as no reconciliation data has been processed, you can request a full refund."
      },
      "api": {
        "question": "Is there an API?",
        "answer": "Pro plans and above include a REST API for order data push, reconciliation result queries, webhook callbacks, and more."
      },
      "contract": {
        "question": "Do I need to sign a contract?",
        "answer": "Enterprise plans require a formal contract and can issue VAT special invoices. Pro plans can be purchased directly online with invoices issued after order completion."
      },
      "compare": {
        "question": "How is this different from hiring an accountant?",
        "answer": "Suanpan is an automation tool, not a human service. We automate 90% of reconciliation work. For the remaining 10% complex cases, you can handle them yourself or consult an accountant. Many accounting firms use suanpan to improve their efficiency."
      }
    }
  },
  "cta": {
    "heading": "First-time reconciliation? 30 minutes is all you need.",
    "body": "Upload your first order and let suanpan get to work. 14-day free trial — pay only when satisfied.",
    "button": "Start free trial — no credit card required"
  },
  "footer": {
    "brand_blurb": "Suanpan, your 24/7 AI reconciliation partner. Every order, every cent, accounted for.",
    "marquee": {
      "row1": {
        "phrase_1": "94% auto-match",
        "phrase_2": "Zero missing orders",
        "phrase_3": "12+ platforms",
        "phrase_4": "24/7 monitoring",
        "phrase_5": "30 min complete",
        "phrase_6": "99.9% accuracy",
        "phrase_7": "Real-time alerts",
        "phrase_8": "No Excel needed"
      },
      "row2": {
        "phrase_1": "14-day free trial",
        "phrase_2": "From ¥199/mo",
        "phrase_3": "API access",
        "phrase_4": "Private deploy",
        "phrase_5": "Bank-grade crypto",
        "phrase_6": "ISO27001",
        "phrase_7": "7-day refund",
        "phrase_8": "Export anytime"
      }
    },
    "columns": {
      "product": {
        "title": "Product",
        "links": {
          "features": "Features",
          "how_it_works": "How it works",
          "pricing": "Pricing",
          "changelog": "Changelog"
        }
      },
      "resources": {
        "title": "Resources",
        "links": {
          "docs": "Docs",
          "blog": "Blog",
          "api": "API Docs",
          "github": "GitHub"
        }
      },
      "company": {
        "title": "Company",
        "links": {
          "about": "About",
          "contact": "Contact",
          "careers": "Careers",
          "privacy": "Privacy"
        }
      },
      "legal": {
        "title": "Legal",
        "links": {
          "terms": "Terms",
          "privacy": "Privacy",
          "license": "License"
        }
      }
    },
    "copyright": "© {{year}} Suanpan. Beyond reconciliation."
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/views/locales/en/marketing.json
git commit -m "feat(i18n): rewrite en marketing copy for suanpan AI accountant"
```

---

## Task 9: 更新组件以支持新文案

**Files:**
- Modify: `packages/views/marketing/integrations-section.tsx`
- Modify: `packages/views/marketing/comparison-section.tsx`
- Modify: `packages/views/marketing/pricing-section.tsx`
- Modify: `packages/views/marketing/faq-section.tsx`
- Modify: `packages/views/marketing/cta-section.tsx`
- Modify: `packages/views/marketing/nav.tsx`
- Modify: `packages/views/marketing/footer.tsx`

- [ ] **Step 1: 更新 IntegrationsSection 工具列表**

修改 `integrations-section.tsx` 中的 `TOOL_KEYS` 为新的电商平台列表：

```typescript
const TOOL_KEYS = [
  "taobao",
  "douyin",
  "pinduoduo",
  "jd",
  "kuaishou",
  "xiaohongshu",
  "weishop",
  "bilibili",
  "shopify",
  "amazon",
  "lazada",
  "shopee",
] as const;
```

- [ ] **Step 2: 更新 ComparisonSection 对比列**

修改 `comparison-section.tsx` 中的 `COL_KEYS`：

```typescript
const COL_KEYS = ["suanpan", "manual", "excel", "software"] as const;
```

并更新 `ROW_KEYS`：

```typescript
const ROW_KEYS = [
  "monthly_time",
  "auto_match",
  "missing_rate",
  "alert_speed",
  "monthly_cost",
] as const;
```

- [ ] **Step 3: 更新 PricingSection 定价层级**

修改 `pricing-section.tsx` 中的 `TIER_KEYS` 确保与新文案一致。

- [ ] **Step 4: 更新 FAQSection 问题列表**

修改 `faq-section.tsx` 中的 `FAQ_KEYS`：

```typescript
const FAQ_KEYS = [
  "platforms",
  "security",
  "learning",
  "payment",
  "refund",
  "api",
  "contract",
  "compare",
] as const;
```

- [ ] **Step 5: 测试页面渲染**

```bash
pnpm dev:web
```

访问 `http://localhost:3000` 确认：
- 品牌色已更新为青色
- 所有文案正确显示
- 组件顺序正确
- 锚点导航工作正常

- [ ] **Step 6: Commit**

```bash
git add packages/views/marketing/
git commit -m "feat(marketing): update components for new suanpan branding"
```

---

## Task 10: 更新测试文件

**Files:**
- Modify: `packages/views/marketing/landing-page.test.tsx`

- [ ] **Step 1: 更新测试以匹配新组件**

```typescript
import { render, screen } from "@testing-library/react";
import { LandingPage } from "./landing-page";

// Mock i18n
vi.mock("../i18n", () => ({
  useT: () => (key: string) => {
    const translations = {
      "marketing": {
        nav: { sign_up: "Start free trial" },
        hero: { headline: "Reconcile in 30 min" },
        // ... minimal mock data
      },
    };
    // Simple path resolution
    const keys = key.split(".");
    let result: any = translations;
    for (const k of keys) {
      result = result[k];
    }
    return typeof result === "string" ? result : key;
  },
}));

// Mock navigation
vi.mock("../navigation", () => ({
  AppLink: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe("LandingPage", () => {
  it("renders hero section", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Reconcile in 30 min/i)).toBeInTheDocument();
  });

  it("renders feature cards", () => {
    render(<LandingPage />);
    expect(screen.getByText(/Order Reconciliation/i)).toBeInTheDocument();
  });

  it("renders chat demo section", () => {
    render(<LandingPage />);
    expect(screen.getByText(/No Excel skills needed/i)).toBeInTheDocument();
  });

  it("renders testimonials", () => {
    render(<LandingPage />);
    expect(screen.getByText(/5,000\+ merchants/i)).toBeInTheDocument();
  });

  it("renders pricing", () => {
    render(<LandingPage />);
    expect(screen.getByText(/¥199/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
pnpm --filter @teamify/views exec vitest run marketing/landing-page.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add packages/views/marketing/landing-page.test.tsx
git commit -m "test(marketing): update tests for new landing page structure"
```

---

## Task 11: 创建简单 Logo SVG

**Files:**
- Create: `packages/public/logo/suanpan-icon.svg`

- [ ] **Step 1: 创建抽象几何 Logo**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <!-- Two abstract "abacus beads" forming an S-curve -->
  <circle cx="24" cy="24" r="12" fill="url(#gradient1)" />
  <circle cx="40" cy="40" r="12" fill="url(#gradient2)" />
  <!-- Connecting accent -->
  <path d="M24 36 Q 32 32 40 28" stroke="#008F82" stroke-width="2" fill="none" opacity="0.5"/>
  <defs>
    <linearGradient id="gradient1" x1="12" y1="12" x2="36" y2="36">
      <stop stop-color="#00B4A5"/>
      <stop offset="1" stop-color="#008F82"/>
    </linearGradient>
    <linearGradient id="gradient2" x1="28" y1="28" x2="52" y2="52">
      <stop stop-color="#008F82"/>
      <stop offset="1" stop-color="#006666"/>
    </linearGradient>
  </defs>
</svg>
```

- [ ] **Step 2: 更新现有 Logo 引用**

将 `/logo.svg` 更新为新设计，或替换为新文件路径。

- [ ] **Step 3: Commit**

```bash
git add packages/public/logo/suanpan-icon.svg
git commit -m "feat(brand): add suanpan logo SVG with abstract abacus design"
```

---

## 验证检查清单

在标记任务完成之前，运行以下验证：

- [ ] **品牌色验证**：`pnpm dev:web` 确认品牌色为青色 `#00B4A5`
- [ ] **文案验证**：切换中英文，确认所有文案正确显示
- [ ] **组件顺序**：Hero → Features → Integrations → Chat Demo → Comparison → Testimonials → Pricing → FAQ → CTA
- [ ] **响应式验证**：检查移动端、平板、桌面端布局
- [ ] **导航验证**：点击锚点链接，确认平滑滚动
- [ ] **CTA 验证**：点击主要 CTA 按钮，确认跳转正确
- [ ] **测试通过**：`pnpm test` 在 views 包中通过

---

**总预计时间**: 2-3 小时（包含测试和验证）
**提交数**: 约 12 个原子提交
