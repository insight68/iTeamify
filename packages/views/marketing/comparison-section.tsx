"use client";

import { Check, Minus } from "lucide-react";
import { useT } from "../i18n";

const ROW_KEYS = [
  "cost",
  "onboarding",
  "working_hours",
  "proactivity",
  "context_memory",
  "integration",
] as const;

const COL_KEYS = ["teamify", "chatbot", "sde_agent", "human"] as const;

/**
 * Comparison table: Teamify Agent vs Chatbot vs SDE Agent vs Human.
 * Teamify column is highlighted with brand color and check icons.
 * Uses semantic <table> with <caption> and <th scope> for a11y.
 */
export function ComparisonSection() {
  const { t } = useT("marketing");
  return (
    <section
      id="comparison"
      aria-labelledby="comparison-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.comparison.eyebrow)}
          </p>
          <h2
            id="comparison-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.comparison.heading)}
          </h2>
        </div>
        <div className="mt-14 overflow-x-auto">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl ring-1 ring-foreground/5">
            <table className="w-full min-w-[600px]">
              <caption className="sr-only">
                {t(($) => $.comparison.heading)}
              </caption>
              <thead>
                <tr className="border-b border-border/60 bg-muted/50">
                  <th scope="col" className="px-5 py-4 text-left text-sm font-medium text-muted-foreground">
                    &nbsp;
                  </th>
                  {COL_KEYS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className={`px-5 py-4 text-center text-sm font-semibold ${
                        col === "teamify"
                          ? "text-brand"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t(($) => $.comparison.columns[col])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_KEYS.map((rowKey) => (
                  <tr key={rowKey} className="border-b border-border/40 last:border-b-0">
                    <th scope="row" className="px-5 py-4 text-left text-sm font-medium text-foreground">
                      {t(($) => $.comparison.rows[rowKey].label)}
                    </th>
                    {COL_KEYS.map((colKey) => {
                      const isTeamify = colKey === "teamify";
                      const value = t(($) => $.comparison.rows[rowKey][colKey]);
                      const isCheck = value === "✓";
                      return (
                        <td
                          key={colKey}
                          className={`px-5 py-4 text-center text-sm ${
                            isTeamify ? "font-semibold text-brand" : "text-muted-foreground"
                          }`}
                        >
                          {isCheck ? (
                            <span className="inline-flex items-center gap-1">
                              <Check className="size-3.5" aria-hidden />
                            </span>
                          ) : value === "—" ? (
                            <Minus className="mx-auto size-3.5 opacity-40" aria-hidden />
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}