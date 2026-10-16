"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLocale } from "../i18n";
import { localizedMarketingHref } from "@/lib/marketing-i18n";
import { SERVICE_MARKETING_ROUTES } from "@/lib/service-marketing-routes";
import { BrandLogo, brandLogoName } from "./brand-mark";

export function LandingFooter({ showCta = true }: { showCta?: boolean }) {
  const { locale, session, t } = useLocale();
  const zh = locale === "zh-Hans";
  const href = (path: string) => localizedMarketingHref(path, locale);
  const groups = [
    { label: zh ? "产品能力" : "Product", links: SERVICE_MARKETING_ROUTES.filter((route) => route.kind === "features").map((route) => ({ path: route.path, label: zh ? route.zh : route.en })) },
    { label: zh ? "适用团队" : "Solutions", links: SERVICE_MARKETING_ROUTES.filter((route) => route.kind === "solutions").map((route) => ({ path: route.path, label: zh ? route.zh : route.en })) },
    { label: zh ? "资源与支持" : "Resources", links: [{ path: "/#workflow", label: zh ? "业务流程" : "How it works" }, { path: "/contact-sales", label: zh ? "联系团队" : "Contact us" }, { path: "/about", label: zh ? "关于我们" : "About" }] },
  ];
  return <footer className="service-footer"><div className="service-container"><div className="service-footer-top"><div className="service-footer-brand"><Link href={href("/")} className="service-logo" aria-label={brandLogoName(locale)}><BrandLogo locale={locale} /></Link><p>{zh ? "团队与智能体的共享工作空间。组织任务、项目和知识，持续推进工作。" : "A shared workspace for teams and agents. Organize tasks, projects and knowledge."}</p>{showCta ? <Link className="service-text-link" href={session.ctaHref}>{session.isAuthenticated ? t.header.dashboard : t.header.cta}<ArrowUpRight size={15} aria-hidden /></Link> : null}</div>{groups.map((group) => <div className="service-footer-group" key={group.label}><h2>{group.label}</h2><ul>{group.links.map((link) => <li key={link.path}><Link href={href(link.path)}>{link.label}</Link></li>)}</ul></div>)}</div><div className="service-footer-bottom"><span>© {new Date().getFullYear()} iteamify</span><div><Link href={href("/privacy")}>{zh ? "隐私政策" : "Privacy"}</Link><Link href={href("/terms")}>{zh ? "服务条款" : "Terms"}</Link></div><span>{zh ? "为专业能力的经营而设计" : "Built for the business of expertise."}</span></div></div></footer>;
}
