import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { MarketingLocale } from "@/lib/marketing-i18n";
import type { MarketingSession } from "@/lib/marketing-session";

export function ServiceCta({ locale, session }: { locale: MarketingLocale; session: MarketingSession }) {
  return <Link className="service-button service-button-primary" href={session.ctaHref}>{session.isAuthenticated ? (locale === "zh-Hans" ? "进入 iTeamify" : "Open iTeamify") : (locale === "zh-Hans" ? "开始使用 iTeamify" : "Get started")}<ArrowRight size={16} aria-hidden /></Link>;
}
