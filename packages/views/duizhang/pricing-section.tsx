"use client";

import { Check } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

const TIER_KEYS = ["free", "pro", "enterprise"] as const;
const FEATURE_INDICES = {
  free: [0, 1, 2, 3],
  pro: [0, 1, 2, 3, 4],
  enterprise: [0, 1, 2, 3, 4],
} as const;

/** Feature list key paths per tier per index. */
function featureKey(tier: string, idx: number): string {
  return `pricing.tiers.${tier}.features.${idx}`;
}

/**
 * Three-tier pricing cards. Pro tier is highlighted as recommended.
 * Each card shows name, price, period, description, feature list,
 * and CTA button. Uses semantic tokens for light-tech theme.
 */
export function PricingSection() {
  const { t } = useT("duizhang");
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.pricing.subtitle)}
          </p>
          <h2
            id="pricing-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.pricing.heading)}
          </h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {TIER_KEYS.map((tier) => {
            const isPro = tier === "pro";
            return (
              <div
                key={tier}
                className={`relative flex flex-col rounded-2xl border p-6 shadow-sm md:p-8 ${
                  isPro
                    ? "border-brand/40 bg-card shadow-[0_0_30px_color-mix(in_oklab,var(--brand)_10%,transparent)]"
                    : "border-border/60 bg-card"
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
                    {t(($) => $.pricing.recommended)}
                  </span>
                )}
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {t(($) => $.pricing.tiers[tier].name)}
                </h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-bold text-foreground">
                    {t(($) => $.pricing.tiers[tier].price)}
                  </span>
                  {t(($) => $.pricing.tiers[tier].period) && (
                    <span className="text-sm text-muted-foreground">
                      {t(($) => $.pricing.tiers[tier].period)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(($) => $.pricing.tiers[tier].description)}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {FEATURE_INDICES[tier].map((idx) => {
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const feature = (t as any)(featureKey(tier, idx));
                      if (!feature) return null;
                      return (
                        <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                          <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                          {feature}
                        </li>
                      );
                    } catch {
                      return null;
                    }
                  })}
                </ul>
                <div className="mt-6">
                  <AppLink
                    href={tier === "enterprise" ? "/contact" : "/signup"}
                    className={`inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      isPro
                        ? "bg-brand text-brand-foreground hover:bg-brand/90"
                        : "border border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {t(($) => $.pricing.tiers[tier].cta)}
                  </AppLink>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
