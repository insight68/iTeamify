import type { MarketingLocale } from "@/lib/marketing-i18n";
import { findServiceMarketingRoute } from "@/lib/service-marketing-routes";

export type ServicePageCopy = {
  title: string; description: string; eyebrow: string; heading: string; intro: string;
  outcomes: { title: string; body: string }[];
  example: { title: string; brief: string; steps: { title: string; body: string }[]; note: string };
  faq: { question: string; answer: string }[];
};

export function getServicePage(kind: string, slug: string, locale: MarketingLocale) {
  const route = findServiceMarketingRoute(kind, slug);
  if (!route) return null;
  const zh = locale === "zh-Hans";
  const audience = route ? (zh ? route.zh : route.en) : "iTeamify";
  const copy: ServicePageCopy = {
    title: `${audience} | iTeamify`,
    description: zh ? "在共享工作区组织项目、任务和知识，与团队及智能体协作。" : "Organize projects, tasks and knowledge with your team and agents in a shared workspace.",
    eyebrow: audience,
    heading: zh ? "让每一项工作都有清晰的下一步。" : "Give every task a clear next step.",
    intro: zh ? "围绕项目记录任务、负责人和进展，让团队与智能体在同一处协作。" : "Keep tasks, ownership and progress together so your team and agents can collaborate.",
    outcomes: zh ? [
      { title: "组织项目", body: "围绕目标安排任务，明确负责人和优先级。" },
      { title: "分享知识", body: "保留工作背景和资料，方便团队查阅。" },
      { title: "与智能体协作", body: "让智能体参与研究和执行，持续检查工作进展。" },
    ] : [
      { title: "Organize projects", body: "Plan tasks around a goal with clear owners and priorities." },
      { title: "Share knowledge", body: "Keep context and reference material available to your team." },
      { title: "Work with agents", body: "Bring agents into research and execution while reviewing progress." },
    ],
    example: {
      title: zh ? "推进一个团队项目" : "Move a team project forward",
      brief: zh ? "从目标出发，把下一步拆成可以执行的任务。" : "Start with a goal and break the next steps into actionable tasks.",
      steps: zh ? [
        { title: "创建项目", body: "记录目标和背景。" },
        { title: "安排任务", body: "明确负责人、优先级和执行内容。" },
        { title: "更新进展", body: "保留讨论和工作成果，持续更新任务状态。" },
      ] : [
        { title: "Create a project", body: "Record its goal and context." },
        { title: "Assign tasks", body: "Set ownership, priorities and the work to perform." },
        { title: "Track progress", body: "Keep discussions and results together and update task status." },
      ],
      note: zh ? "团队负责检查执行结果。" : "The team reviews the results.",
    },
    faq: [{ question: zh ? "智能体如何参与？" : "How do agents participate?", answer: zh ? "在工作区中配置智能体，并分配适合它们处理的任务。" : "Configure agents in your workspace and assign tasks suited to them." }],
  };
  return { route, copy };
}
