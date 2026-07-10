"use client";

import type { ComponentType } from "react";
import {
  BarChart3,
  ClipboardCheck,
  LineChart,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { useT } from "../i18n";

const AGENT_KEYS = [
  "reconciliation",
  "procurement",
  "transfer",
  "forecast",
  "analytics",
  "compliance",
] as const;

const AGENT_ICONS = {
  reconciliation: ReceiptText,
  procurement: ShoppingCart,
  transfer: Warehouse,
  forecast: LineChart,
  analytics: BarChart3,
  compliance: ShieldCheck,
} satisfies Record<(typeof AGENT_KEYS)[number], ComponentType<{ className?: string }>>;

export function FeatureCards() {
  const { t } = useT("marketing");

  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="border-b border-border/60 bg-background py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.features.eyebrow)}
          </p>
          <h2
            id="features-heading"
            className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.features.heading)}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {t(($) => $.features.body)}
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {AGENT_KEYS.map((key, index) => {
            const Icon = AGENT_ICONS[key];
            return (
              <article
                key={key}
                className="flex min-h-[320px] flex-col rounded-lg border border-border/70 bg-card p-6 transition-colors duration-200 hover:border-brand/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-medium text-muted-foreground">
                    0{index + 1}
                  </span>
                  <span className="flex size-11 items-center justify-center rounded-lg border border-border/70 bg-background text-brand">
                    <Icon className="size-5" aria-hidden />
                  </span>
                </div>
                <h3 className="mt-6 font-heading text-xl font-semibold leading-snug text-foreground">
                  {t(($) => $.features.items[key].title)}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                  {t(($) => $.features.items[key].description)}
                </p>
                <div className="mt-6 space-y-3 border-t border-border/60 pt-5">
                  <AgentFact
                    label={t(($) => $.features.labels.input)}
                    value={t(($) => $.features.items[key].input)}
                  />
                  <AgentFact
                    label={t(($) => $.features.labels.output)}
                    value={t(($) => $.features.items[key].output)}
                  />
                  <AgentDecision value={t(($) => $.features.items[key].human)} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AgentFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-3 text-xs leading-5">
      <span className="font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function AgentDecision({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-foreground">
      <ClipboardCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
      {value}
    </div>
  );
}
