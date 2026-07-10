"use client";

import type { ComponentType } from "react";
import {
  Boxes,
  ClipboardList,
  DatabaseZap,
  FileSpreadsheet,
  ReceiptText,
} from "lucide-react";
import { useT } from "../i18n";

const GROUP_KEYS = [
  "orders",
  "finance",
  "inventory",
  "procurement",
  "analysis",
] as const;

const ITEM_KEYS = ["item_1", "item_2", "item_3", "item_4"] as const;

const GROUP_ICONS = {
  orders: DatabaseZap,
  finance: ReceiptText,
  inventory: Boxes,
  procurement: ClipboardList,
  analysis: FileSpreadsheet,
} satisfies Record<(typeof GROUP_KEYS)[number], ComponentType<{ className?: string }>>;

export function IntegrationsSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="integrations"
      aria-labelledby="integrations-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.integrations.eyebrow)}
          </p>
          <h2
            id="integrations-heading"
            className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.integrations.heading)}
          </h2>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {GROUP_KEYS.map((key) => {
            const Icon = GROUP_ICONS[key];
            return (
              <article
                key={key}
                className="rounded-lg border border-border/70 bg-card p-5 shadow-sm"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-heading text-base font-semibold text-foreground">
                  {t(($) => $.integrations.groups[key].title)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(($) => $.integrations.groups[key].description)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {ITEM_KEYS.map((itemKey) => (
                    <span
                      key={itemKey}
                      className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {t(($) => $.integrations.groups[key][itemKey])}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
