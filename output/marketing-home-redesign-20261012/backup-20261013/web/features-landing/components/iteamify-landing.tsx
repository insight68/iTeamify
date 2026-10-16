import { Bot, FolderKanban, ListTodo } from "lucide-react";
import type { MarketingLocale } from "@/lib/marketing-i18n";
import type { MarketingSession } from "@/lib/marketing-session";
import { LandingHeader } from "./landing-header";
import { LandingFooter } from "./landing-footer";
import { ServiceCta } from "./service-shared";

export function ITeamifyLanding({ locale, session }: { locale: MarketingLocale; session: MarketingSession }) {
  const zh = locale === "zh-Hans";
  const modules = [
    { icon: ListTodo, title: zh ? "任务管理" : "Tasks", body: zh ? "明确负责人、优先级和下一步，让团队持续推进工作。" : "Keep ownership, priorities and next steps clear." },
    { icon: FolderKanban, title: zh ? "项目协作" : "Projects", body: zh ? "围绕项目组织任务、文档和讨论，掌握工作进展。" : "Organize tasks, documents and discussions around each project." },
    { icon: Bot, title: zh ? "与智能体协作" : "Work with agents", body: zh ? "让智能体参与研究和任务执行，在同一个工作区协作。" : "Bring agents into research and task execution in the same workspace." },
  ];
  return <div className="service-site">
    <LandingHeader variant="brand" transparentAtTop={false} />
    <main id="main-content">
      <section className="service-hero service-hero-home"><div className="service-container">
        <p className="service-eyebrow">iTeamify</p>
        <h1>{zh ? "让团队与智能体，\n一起把工作完成。" : "Teams and agents.\nWorking together."}</h1>
        <p className="service-lead">{zh ? "在同一个工作区管理任务、项目和知识，让每一步都有清晰的负责人。" : "Manage tasks, projects and knowledge in one workspace, with clear ownership at every step."}</p>
        <div className="service-actions"><ServiceCta locale={locale} session={session} /></div>
      </div></section>
      <section className="service-container" id="product"><div className="service-modules">
        {modules.map(({ icon: Icon, title, body }) => <article className="service-module" key={title}><Icon size={24} aria-hidden /><h2>{title}</h2><p>{body}</p></article>)}
      </div></section>
      <section className="service-final" id="workflow"><div className="service-container"><h2>{zh ? "从下一项任务开始。" : "Start with your next task."}</h2><ServiceCta locale={locale} session={session} /></div></section>
    </main>
    <LandingFooter />
  </div>;
}
