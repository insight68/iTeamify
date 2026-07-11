"use client";

import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { useT } from "../i18n";

const FEATURE_KEYS = [
  "order_reconciliation",
  "fee_verification",
  "profit_analysis",
  "anomaly_monitoring",
] as const;

const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  order_reconciliation: RefreshCw,
  fee_verification: DollarSign,
  profit_analysis: TrendingUp,
  anomaly_monitoring: ShieldAlert,
};

/**
 * 4 core capability cards in responsive grid.
 * Replaces AgentRoleCards with feature-focused cards for suanpan.
 */
export function FeatureCards() {
  const { t } = useT("duizhang");

  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.features.eyebrow)}
          </p>
          <h2
            id="features-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.features.heading)}
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_KEYS.map((key) => {
            const Icon = FEATURE_ICONS[key]!;
            return (
              <div
                key={key}
                className="group rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_0_20px_color-mix(in_oklab,var(--brand)_12%,transparent)]"
              >
                <span className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {t(($) => $.features.items[key].title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(($) => $.features.items[key].description)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
