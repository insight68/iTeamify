"use client";

import {
  Bot,
  Code2,
  GitPullRequest,
  ShieldCheck,
  BarChart3,
  Server,
  FileText,
  Activity,
  HeadphonesIcon,
  Compass,
} from "lucide-react";
import { useT } from "../i18n";

const ROLE_KEYS = [
  "coding",
  "review",
  "qa",
  "devops",
  "data_analyst",
  "security",
  "docs",
  "sre",
  "support",
  "architect",
] as const;

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  coding: Code2,
  review: GitPullRequest,
  qa: Bot,
  devops: Server,
  data_analyst: BarChart3,
  security: ShieldCheck,
  docs: FileText,
  sre: Activity,
  support: HeadphonesIcon,
  architect: Compass,
};

/**
 * 10 AI role cards in a responsive grid. Each card shows an icon,
 * role title, and short description. Hover adds a subtle brand
 * glow and slight lift.
 */
export function AgentRoleCards() {
  const { t } = useT("marketing");
  return (
    <section
      id="agents"
      aria-labelledby="agents-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.agent_roles.eyebrow)}
          </p>
          <h2
            id="agents-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.agent_roles.heading)}
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-5">
          {ROLE_KEYS.map((key) => {
            const Icon = ROLE_ICONS[key]!;
            return (
              <div
                key={key}
                className="group rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_0_20px_color-mix(in_oklab,var(--brand)_12%,transparent)]"
              >
                <span className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <h3 className="font-heading text-sm font-semibold text-foreground">
                  {t(($) => $.agent_roles.roles[key].title)}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t(($) => $.agent_roles.roles[key].body)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}