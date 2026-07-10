"use client";

import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  Code2,
  GraduationCap,
  Handshake,
  Mail,
  Rocket,
  ServerCog,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { LandingFooter } from "./footer";
import { LandingNav } from "./nav";

const RESPONSIBILITIES = [
  {
    title: "Agent 前端界面",
    body: "参与企业 Agent 交互、知识库管理面板、工作流编辑器等核心模块的开发与迭代。",
    Icon: Workflow,
  },
  {
    title: "部署工具链",
    body: "协作完成私有化部署配置面板、沙箱测试环境、多租户管理界面等前端能力。",
    Icon: ServerCog,
  },
  {
    title: "工程化与实施",
    body: "参与前端工程化体系建设，并在企业业务落地过程中承担实现与交付工作。",
    Icon: Code2,
  },
  {
    title: "方案设计",
    body: "与业务团队紧密配合，在 Agent 能力落地过程中参与技术方案设计与实现。",
    Icon: Handshake,
  },
] as const;

const REQUIREMENTS = [
  "计算机科学、软件工程、电子信息等相关专业，本科及以上在读。",
  "对 AI Native 非常痴迷，了解 FDE，有持续学习热情、扎实动手能力和突破边界的驱动力。",
  "有实际 vibe coding 项目经验，项目真正投入运营并产生收入；简历请重点阐述项目情况。",
  "具备良好的团队协作意识和沟通表达能力，能对问题进行深入分析并独立解决。",
] as const;

const BONUSES = [
  "有 AI/LLM 产品相关前端项目经验，如对话式交互界面、富文本编辑器、可视化工作流编辑器等。",
  "有 Docker、Nginx 配置、Cloudflare Pages 等部署实践经验，或熟悉前端部署与运维基础。",
  "在 GitHub 有活跃开源贡献，或有高质量个人项目、博客技术输出。",
  "有大型前端项目的性能优化、可访问性、国际化等相关实践经验。",
] as const;

const PRACTICES = [
  {
    label: "硬核技术栈",
    value: "大模型 + 前端工程 + 高可用运维",
  },
  {
    label: "工程文化",
    value: "扎实实现、快速验证、持续复盘",
  },
  {
    label: "产品导向",
    value: "进入真实企业场景，解决真实业务问题",
  },
] as const;

export function CareersPage() {
  return (
    <>
      <LandingNav />
      <main className="bg-background text-foreground">
        <Hero />
        <PracticeBand />
        <RoleSection />
        <CriteriaSection />
        <ApplySection />
      </main>
      <LandingFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:px-6 md:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <BriefcaseBusiness className="size-3.5 text-brand" aria-hidden />
            均朴科技招聘 · 企业 Agent FDE
          </div>
          <h1 className="mt-5 max-w-3xl font-serif text-4xl font-normal leading-tight text-foreground sm:text-5xl md:text-6xl">
            企业 Agent FDE 工程师
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            均朴智能是企业 Agent 领域的创新者，致力于让每个企业拥有专属 AI
            工作伙伴。我们自研企业级 Agent 研发与部署平台，深度融合大模型、
            前端工程与高可用运维能力。
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="mailto:hr@junpu.org"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              投递简历
              <ArrowRight className="size-4" aria-hidden />
            </a>
            <a
              href="#role"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              查看岗位
            </a>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4 text-brand" aria-hidden />
            简历投递至
            <a
              href="mailto:hr@junpu.org"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              hr@junpu.org
            </a>
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <img
              src="/marketing/procurement-assistant-workbench.jpg"
              alt="企业 Agent 工作台界面"
              className="aspect-[16/11] w-full object-cover"
              width={1200}
              height={824}
              loading="eager"
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Agent 交互", "前端体验"],
              ["部署面板", "私有化交付"],
              ["业务落地", "FDE 场景"],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PracticeBand() {
  return (
    <section className="border-b border-border/60 bg-muted/35">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:grid-cols-3 md:px-6">
        {PRACTICES.map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoleSection() {
  return (
    <section id="role" className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
      <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-brand" aria-hidden />
            招聘岗位
          </div>
          <h2 className="mt-4 font-serif text-3xl font-normal leading-tight text-foreground sm:text-4xl">
            企业 Agent 前端部署工程师
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            这是一个面向企业 Agent 落地的一线工程岗位。你会直接参与研发、
            部署、试点和实施，把 AI Native 产品能力变成客户现场可用的工作伙伴。
          </p>
          <div className="mt-6 rounded-lg border border-border bg-muted/35 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Rocket className="size-4 text-brand" aria-hidden />
              最佳 FDE 实践场景
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              FDE 是硅谷热门职业方向。均朴智能提供企业 Agent 平台、真实业务现场和完整部署链路，让工程能力直接连接产品价值。
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {RESPONSIBILITIES.map(({ title, body, Icon }) => (
            <article key={title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon className="size-4" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CriteriaSection() {
  return (
    <section className="border-y border-border/60 bg-muted/35">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:px-6 md:py-20 lg:grid-cols-2">
        <Checklist
          eyebrow="岗位要求"
          title="我们希望你已经在真实项目里训练过自己"
          icon={<GraduationCap className="size-4" aria-hidden />}
          items={REQUIREMENTS}
        />
        <Checklist
          eyebrow="加分项"
          title="这些经验会让你更快进入现场"
          icon={<BadgeCheck className="size-4" aria-hidden />}
          items={BONUSES}
        />
      </div>
    </section>
  );
}

function Checklist({
  eyebrow,
  title,
  icon,
  items,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  items: readonly string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
        {icon}
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold leading-tight text-foreground">
        {title}
      </h2>
      <ul className="mt-6 space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
            <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <BadgeCheck className="size-3.5" aria-hidden />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApplySection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
      <div className="grid gap-8 rounded-lg border border-border bg-card p-6 shadow-sm md:grid-cols-[1fr_auto] md:items-center md:p-8">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <Boxes className="size-3.5 text-brand" aria-hidden />
              企业 Agent
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <BookOpenText className="size-3.5 text-brand" aria-hidden />
              FDE 实践
            </span>
          </div>
          <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-foreground sm:text-4xl">
            把你的项目、代码和真实运营结果发给我们
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            简历请重点说明你做过的 vibe coding 项目：解决什么问题、如何上线运营、收入或用户反馈如何，以及你在其中承担的工程工作。
          </p>
        </div>
        <a
          href="mailto:hr@junpu.org"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          hr@junpu.org
          <Mail className="size-4" aria-hidden />
        </a>
      </div>
    </section>
  );
}
