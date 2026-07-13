"use client";

import type { ComponentType } from "react";
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Building2,
  DatabaseZap,
  FileSpreadsheet,
  PlugZap,
  ShoppingBag,
} from "lucide-react";
import { useT } from "../i18n";

const GROUP_KEYS = ["erp", "commerce", "collaboration"] as const;
const SYSTEM_KEYS = [
  "kingdee",
  "wangdiantong",
  "yonyou",
  "jushuitan",
  "taobao",
  "jd",
  "douyin",
  "pinduoduo",
  "excel",
  "lark",
  "dingtalk",
  "api",
] as const;
const DATA_KEYS = ["orders", "cash", "inventory", "procurement"] as const;
const AGENT_KEYS = [
  "reconciliation",
  "procurement",
  "transfer",
  "forecast",
  "analysis",
  "audit",
] as const;

type GroupKey = (typeof GROUP_KEYS)[number];
type SystemKey = (typeof SYSTEM_KEYS)[number];

const GROUP_SYSTEMS = {
  erp: ["kingdee", "wangdiantong", "yonyou", "jushuitan"],
  commerce: ["taobao", "jd", "douyin", "pinduoduo"],
  collaboration: ["excel", "lark", "dingtalk", "api"],
} satisfies Record<GroupKey, ReadonlyArray<SystemKey>>;

const GROUP_ICONS = {
  erp: Building2,
  commerce: ShoppingBag,
  collaboration: FileSpreadsheet,
} satisfies Record<GroupKey, ComponentType<{ className?: string }>>;

export function IntegrationsSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="integrations"
      aria-labelledby="integrations-heading"
      className="border-y border-border/60 bg-muted/20 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid gap-7 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
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
          <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            {t(($) => $.integrations.body)}
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="size-2 rounded-full bg-brand" aria-hidden />
              {t(($) => $.integrations.support_badge)}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>{t(($) => $.integrations.capability_1)}</span>
              <span>{t(($) => $.integrations.capability_2)}</span>
              <span>{t(($) => $.integrations.capability_3)}</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.2fr)_84px_minmax(300px,0.8fr)]">
            <div>
              <p className="border-b border-border/70 px-5 py-4 text-xs font-medium uppercase tracking-wider text-muted-foreground md:px-6">
                {t(($) => $.integrations.source_label)}
              </p>
              {GROUP_KEYS.map((groupKey) => {
                const Icon = GROUP_ICONS[groupKey];
                return (
                  <div
                    key={groupKey}
                    className="grid gap-4 border-b border-border/70 px-5 py-5 last:border-b-0 md:grid-cols-[150px_1fr] md:px-6"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <h3 className="text-sm font-semibold text-foreground">
                        {t(($) => $.integrations.groups[groupKey].title)}
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3 2xl:grid-cols-4">
                      {GROUP_SYSTEMS[groupKey].map((systemKey) => (
                        <div key={systemKey} className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-[10px] font-semibold text-brand">
                            {t(($) => $.integrations.systems[systemKey].code)}
                          </span>
                          <span className="min-w-0 text-sm font-medium leading-5 text-foreground">
                            {t(($) => $.integrations.systems[systemKey].name)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative hidden items-center justify-center border-x border-border/70 bg-muted/30 lg:flex">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80" aria-hidden />
              <span className="relative flex size-12 items-center justify-center rounded-full border border-brand/30 bg-background text-brand shadow-sm">
                <ArrowRight className="size-5" aria-hidden />
              </span>
            </div>

            <div className="border-t border-border/70 p-5 md:p-6 lg:border-t-0">
              <div className="mb-5 flex items-center justify-center gap-3 border-b border-border/70 pb-5 text-sm font-medium text-brand lg:hidden">
                <ArrowDown className="size-4" aria-hidden />
                {t(($) => $.integrations.connector_label)}
              </div>

              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                  <DatabaseZap className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-brand">
                    {t(($) => $.integrations.hub.eyebrow)}
                  </p>
                  <p className="mt-1 font-heading text-lg font-semibold text-foreground">
                    iTeamify
                  </p>
                </div>
              </div>

              <h3 className="mt-6 text-balance font-serif text-2xl font-normal tracking-tight text-foreground md:text-3xl">
                {t(($) => $.integrations.hub.title)}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t(($) => $.integrations.hub.body)}
              </p>

              <div className="mt-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t(($) => $.integrations.hub.data_label)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {DATA_KEYS.map((key) => (
                    <span
                      key={key}
                      className="flex min-h-9 items-center gap-2 rounded-md bg-muted px-3 text-xs font-medium text-foreground"
                    >
                      <Boxes className="size-3.5 shrink-0 text-brand" aria-hidden />
                      {t(($) => $.integrations.hub.data[key])}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 border-t border-border/70 pt-5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <PlugZap className="size-3.5 text-brand" aria-hidden />
                  {t(($) => $.integrations.hub.agents_label)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {AGENT_KEYS.map((key) => (
                    <span
                      key={key}
                      className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                    >
                      {t(($) => $.integrations.hub.agents[key])}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
