"use client";

import { ArrowRight, BarChart3 } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Hero section with quantitative value proposition, chat demo preview,
 * stat badges, and dual CTAs. Suanpan (AI accountant) branding.
 */
export function HeroSection() {
  const { t } = useT("marketing");

  const stats = [
    t(($) => $.hero.stats.platforms),
    t(($) => $.hero.stats.merchants),
    t(($) => $.hero.stats.accuracy),
  ];

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
            <span key={i} className="inline-flex items-center rounded-full border border-border/60 bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              {stat}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
