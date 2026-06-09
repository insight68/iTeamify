"use client";

import { Check } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

const ROW_KEYS = [
  "monthly_cost",
  "onboarding",
  "working_hours",
  "capabilities",
] as const;

/**
 * Comparison table: Teamify Agent vs Human Employee. Uses semantic
 * `<table>` with `<caption>` and `<th scope>` for accessibility.
 * Agent column uses brand color and checkmarks; human column uses
 * muted styling. Bottom CTA button drives signups.
 */
export function PricingSection() {
  const { t } = useT("marketing");
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-4xl px-4 md:px-6">
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
        <div className="mt-14 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl ring-1 ring-foreground/5">
          <table className="w-full">
            <caption className="sr-only">
              {t(($) => $.pricing.heading)}
            </caption>
            <thead>
              <tr className="border-b border-border/60 bg-muted/50">
                <th scope="col" className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                  &nbsp;
                </th>
                <th scope="col" className="px-6 py-4 text-center text-sm font-semibold text-brand">
                  {t(($) => $.pricing.agent_col)}
                </th>
                <th scope="col" className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                  {t(($) => $.pricing.human_col)}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROW_KEYS.map((key) => (
                <tr key={key} className="border-b border-border/40 last:border-b-0">
                  <th scope="row" className="px-6 py-4 text-left text-sm font-medium text-foreground">
                    {t(($) => $.pricing.rows[key].label)}
                  </th>
                  <td className="px-6 py-4 text-center text-sm font-semibold text-brand">
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="size-3.5" aria-hidden />
                      {t(($) => $.pricing.rows[key].agent)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                    {t(($) => $.pricing.rows[key].human)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 text-center">
          <AppLink
            href="/signup"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t(($) => $.pricing.cta)}
          </AppLink>
        </div>
      </div>
    </section>
  );
}