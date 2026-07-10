"use client";

import type { ComponentType } from "react";
import {
  BarChart3,
  LineChart,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import { useT } from "../i18n";

const STEP_KEYS = [
  "forecast",
  "procurement",
  "transfer",
  "reconciliation",
  "analytics",
  "compliance",
] as const;

const STEP_ICONS = {
  forecast: LineChart,
  procurement: ShoppingCart,
  transfer: Warehouse,
  reconciliation: ReceiptText,
  analytics: BarChart3,
  compliance: ShieldCheck,
} satisfies Record<(typeof STEP_KEYS)[number], ComponentType<{ className?: string }>>;

/**
 * Explains why the six agents work as a team instead of isolated tools.
 */
export function OperatingLoopSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="operating-loop"
      aria-labelledby="operating-loop-heading"
      className="border-b border-border/60 bg-muted/25 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-wider text-brand">
              {t(($) => $.operating_loop.eyebrow)}
            </p>
            <h2
              id="operating-loop-heading"
              className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
            >
              {t(($) => $.operating_loop.heading)}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              {t(($) => $.operating_loop.body)}
            </p>
            <p className="mt-8 border-l border-brand/50 pl-4 text-sm leading-6 text-foreground">
              {t(($) => $.operating_loop.closing_note)}
            </p>
          </div>

          <ol className="relative border-y border-border/70">
            <span
              aria-hidden
              className="absolute left-5 top-8 hidden h-[calc(100%-4rem)] w-px bg-border md:block"
            />
            {STEP_KEYS.map((key, index) => {
              const Icon = STEP_ICONS[key];

              return (
                <li
                  key={key}
                  className="relative grid gap-4 border-b border-border/60 py-5 last:border-b-0 md:grid-cols-[112px_1fr_150px] md:items-center md:gap-6 md:pl-16"
                >
                  <div className="flex items-center gap-3 md:absolute md:left-0 md:top-5">
                    <span className="z-10 flex size-10 items-center justify-center rounded-full border border-border bg-background text-brand shadow-sm">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="font-mono text-xs font-medium text-muted-foreground md:hidden">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 md:block">
                    <span className="hidden font-mono text-xs font-medium text-muted-foreground md:block">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wider text-brand md:mt-1 md:block">
                      {t(($) => $.operating_loop.steps[key].phase)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-semibold leading-snug text-foreground">
                      {t(($) => $.operating_loop.steps[key].title)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {t(($) => $.operating_loop.steps[key].body)}
                    </p>
                  </div>
                  <p className="rounded-md bg-background px-3 py-2 text-xs font-medium leading-5 text-foreground ring-1 ring-border/70">
                    {t(($) => $.operating_loop.steps[key].signal)}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
