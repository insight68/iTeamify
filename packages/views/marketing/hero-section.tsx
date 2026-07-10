"use client";

import type { ComponentType } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  LineChart,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

const STAT_KEYS = ["platforms", "merchants", "accuracy"] as const;
const METRIC_KEYS = ["reconciliation", "forecast", "transfer", "profit"] as const;
const AGENT_KEYS = [
  "reconciliation",
  "forecast",
  "procurement",
  "transfer",
  "analytics",
] as const;

const AGENT_ICONS = {
  reconciliation: ReceiptText,
  forecast: LineChart,
  procurement: ShoppingCart,
  transfer: Warehouse,
  analytics: BarChart3,
} satisfies Record<(typeof AGENT_KEYS)[number], ComponentType<{ className?: string }>>;

const METRIC_TONES = {
  reconciliation: "text-brand",
  forecast: "text-success",
  transfer: "text-info",
  profit: "text-warning",
} satisfies Record<(typeof METRIC_KEYS)[number], string>;

/**
 * Above-fold operating hub inspired by B2B AI agent pages: positioning on the
 * left, live multi-agent dashboard on the right.
 */
export function HeroSection() {
  const { t } = useT("marketing");

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in oklab, var(--border) 72%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 72%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "linear-gradient(to bottom, black, transparent 82%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--brand)_16%,transparent),transparent_64%)]"
      />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-4 pb-12 pt-14 md:px-6 md:pb-16 md:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-20 lg:pt-28">
        <div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            {t(($) => $.hero.eyebrow)}
          </span>
          <h1 className="mt-5 text-balance font-serif text-4xl font-normal leading-[1.04] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {t(($) => $.hero.headline)}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t(($) => $.hero.sub_headline)}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <AppLink
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(($) => $.hero.primary_cta)}
              <ArrowRight className="size-4" aria-hidden />
            </AppLink>
            <AppLink
              href="/reconciliation"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              <ReceiptText className="size-4 text-brand" aria-hidden />
              {t(($) => $.hero.secondary_cta)}
            </AppLink>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {STAT_KEYS.map((key) => (
              <div
                key={key}
                className="rounded-lg border border-border/70 bg-card/80 px-3 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur"
              >
                {t(($) => $.hero.stats[key])}
              </div>
            ))}
          </div>
        </div>

        <OperatingHub />
      </div>
    </section>
  );
}

function OperatingHub() {
  const { t } = useT("marketing");

  return (
    <div className="relative">
      <div className="rounded-lg border border-border/70 bg-card shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 md:px-5">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t(($) => $.hero.dashboard.title)}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {t(($) => $.hero.dashboard.agent_count)}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            {t(($) => $.hero.dashboard.live_badge)}
          </span>
        </div>

        <div className="grid gap-px bg-border/60 sm:grid-cols-4">
          {METRIC_KEYS.map((key) => (
            <div key={key} className="bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {t(($) => $.hero.dashboard.metrics[key].label)}
              </p>
              <p className={`mt-2 text-2xl font-semibold ${METRIC_TONES[key]}`}>
                {t(($) => $.hero.dashboard.metrics[key].value)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t(($) => $.hero.dashboard.metrics[key].delta)}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-3 p-4 md:p-5">
          {AGENT_KEYS.map((key) => {
            const Icon = AGENT_ICONS[key];
            return (
              <div
                key={key}
                className="grid gap-3 rounded-lg border border-border/70 bg-background/70 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-sm font-semibold text-foreground">
                      {t(($) => $.hero.dashboard.agents[key].name)}
                    </p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t(($) => $.hero.dashboard.agents[key].status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(($) => $.hero.dashboard.agents[key].detail)}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-card px-3 py-2 sm:w-40">
                  <p className="text-xs leading-5 text-foreground">
                    {t(($) => $.hero.dashboard.agents[key].result)}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand">
                    {t(($) => $.hero.dashboard.agents[key].action)}
                    <ArrowRight className="size-3" aria-hidden />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="pointer-events-none absolute -bottom-5 -left-5 hidden rounded-lg border border-border/60 bg-card px-4 py-3 text-xs shadow-lg md:block">
        <div className="flex items-center gap-2 text-muted-foreground">
          <PackageCheck className="size-4 text-info" aria-hidden />
          {t(($) => $.hero.dashboard.stock_signal)}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-4 -top-4 hidden rounded-lg border border-border/60 bg-card px-4 py-3 text-xs shadow-lg md:block">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CircleDollarSign className="size-4 text-warning" aria-hidden />
          {t(($) => $.hero.dashboard.cash_signal)}
        </div>
      </div>
    </div>
  );
}
