"use client";

import { CheckCircle2 } from "lucide-react";
import { useT } from "../i18n";

const ROW_KEYS = [
  "scope",
  "agents",
  "decision",
  "freshness",
  "traceability",
] as const;

const COL_KEYS = ["iteamify", "erp", "bi", "manual"] as const;

export function ComparisonSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="comparison"
      aria-labelledby="comparison-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.comparison.eyebrow)}
          </p>
          <h2
            id="comparison-heading"
            className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.comparison.heading)}
          </h2>
        </div>
        <div className="mt-12 overflow-x-auto">
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-lg ring-1 ring-foreground/5">
            <table className="w-full min-w-[720px]">
              <caption className="sr-only">
                {t(($) => $.comparison.heading)}
              </caption>
              <thead>
                <tr className="border-b border-border/60 bg-muted/60">
                  <th scope="col" className="px-5 py-4 text-left text-sm font-medium text-muted-foreground">
                    &nbsp;
                  </th>
                  {COL_KEYS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className={`px-5 py-4 text-left text-sm font-semibold ${
                        col === "iteamify" ? "text-brand" : "text-muted-foreground"
                      }`}
                    >
                      {t(($) => $.comparison.columns[col])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_KEYS.map((rowKey) => (
                  <tr key={rowKey} className="border-b border-border/50 last:border-b-0">
                    <th scope="row" className="px-5 py-4 text-left text-sm font-medium text-foreground">
                      {t(($) => $.comparison.rows[rowKey].label)}
                    </th>
                    {COL_KEYS.map((colKey) => {
                      const isTeamify = colKey === "iteamify";
                      return (
                        <td
                          key={colKey}
                          className={`px-5 py-4 text-left text-sm leading-6 ${
                            isTeamify ? "font-semibold text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <span className="inline-flex items-start gap-2">
                            {isTeamify && (
                              <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-success" aria-hidden />
                            )}
                            {t(($) => $.comparison.rows[rowKey][colKey])}
                          </span>
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
