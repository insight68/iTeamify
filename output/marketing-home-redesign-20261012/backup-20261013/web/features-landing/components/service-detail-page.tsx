import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, FileText } from "lucide-react";
import { localizedMarketingHref, type MarketingLocale } from "@/lib/marketing-i18n";
import type { MarketingSession } from "@/lib/marketing-session";
import { SERVICE_MARKETING_ROUTES, type ServiceMarketingRoute } from "@/lib/service-marketing-routes";
import type { ServicePageCopy } from "../content/service-pages";
import { LandingHeader } from "./landing-header";
import { LandingFooter } from "./landing-footer";
import { ServiceCta } from "./service-shared";

export function ServiceDetailPage({ route, copy, locale, session }: { route: ServiceMarketingRoute; copy: ServicePageCopy; locale: MarketingLocale; session: MarketingSession }) {
  const zh = locale === "zh-Hans";
  const href = (path: string) => localizedMarketingHref(path, locale);
  const related = SERVICE_MARKETING_ROUTES.filter((item) => item.kind !== route.kind);
  return <div className="service-site"><LandingHeader variant="brand" transparentAtTop={false} /><main id="main-content">
    <section className="service-detail-hero service-container"><nav className="service-breadcrumb" aria-label={zh ? "面包屑导航" : "Breadcrumb"}><Link href={href("/")}>iteamify</Link><ChevronRight size={12} aria-hidden /><Link href={href(route.kind === "solutions" ? "/#solutions" : "/#product")}>{route.kind === "solutions" ? (zh ? "适用团队" : "Solutions") : (zh ? "产品能力" : "Product")}</Link></nav><p className="service-eyebrow">{copy.eyebrow}</p><h1>{copy.heading}</h1><p className="service-lead">{copy.intro}</p><div className="service-actions"><ServiceCta locale={locale} session={session} /><Link className="service-button service-button-secondary" href="#example">{zh ? "查看工作示例" : "See an example"}<ArrowUpRight size={16} aria-hidden /></Link></div></section>
    <section className="service-container service-detail-outcomes" aria-label={zh ? "业务能力" : "What you can do"}>{copy.outcomes.map((item, index) => <article key={item.title}><span className="service-detail-number">0{index + 1}</span><h2>{item.title}</h2><p>{item.body}</p></article>)}</section>
    <section className="service-workflow service-detail-example" id="example"><div className="service-container"><div className="service-section-heading"><div><p className="service-eyebrow">{zh ? "工作示例" : "A workflow in practice"}</p><h2>{copy.example.title}</h2></div><p>{copy.example.brief}</p></div><ol className="service-example-steps">{copy.example.steps.map((step, index) => <li key={step.title}><span><FileText size={17} aria-hidden /><span>0{index + 1}</span></span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol><p className="service-example-note">{copy.example.note}</p></div></section>
    <section className="service-faq service-container"><div><p className="service-eyebrow">{zh ? "了解功能边界" : "The practical details"}</p><h2>{zh ? "开始之前。" : "Before you get started."}</h2></div><div>{copy.faq.map((item) => <details key={item.question}><summary>{item.question}<ChevronRight size={17} aria-hidden /></summary><p>{item.answer}</p></details>)}</div></section>
    <section className="service-container service-related"><p className="service-eyebrow">{zh ? "继续了解" : "See how it fits your business"}</p><div>{related.map((item) => <Link key={item.slug} href={href(item.path)}><Check size={15} aria-hidden /><span>{zh ? item.zh : item.en}</span><ArrowRight size={16} aria-hidden /></Link>)}</div></section>
    <section className="service-final"><div className="service-container"><div><p className="service-eyebrow">{zh ? "你的下一步" : "Your next step"}</p><h2>{zh ? "从下一个信号开始。" : "Start with the next signal."}</h2></div><ServiceCta locale={locale} session={session} /></div></section>
  </main><LandingFooter showCta={false} /></div>;
}
