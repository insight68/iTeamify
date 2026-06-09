"use client";

import type { FC } from "react";
import { Bot, Check, Clock } from "lucide-react";
import { useT } from "../i18n";

const FEATURE_KEYS = [
  "ready_day_one",
  "acts_proactively",
  "remembers_context",
  "works_across_timezones",
] as const;

const FEATURE_MOCKUPS: FC[] = [
  KnowledgeBaseMockup,
  ProactiveActionMockup,
  OrgMemoryMockup,
  TimezoneMockup,
];

/**
 * Four feature blocks with alternating layout. Each block shows a
 * CSS-only mockup on one side and descriptive text on the other.
 * Odd blocks: left mockup + right text; even blocks: right mockup + left text.
 */
export function FeatureShowcase() {
  const { t } = useT("marketing");
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="py-20 md:py-28"
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
        <div className="mt-14 space-y-16 md:space-y-20">
          {FEATURE_KEYS.map((key, idx) => {
            const Mockup = FEATURE_MOCKUPS[idx]!;
            const isOdd = idx % 2 === 0;
            return (
              <div
                key={key}
                className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
              >
                <div className={isOdd ? "md:order-1" : "md:order-2"}>
                  <div
                    className="animate-mockup-float transition-shadow duration-300 hover:shadow-[0_0_30px_color-mix(in_oklab,var(--brand)_25%,transparent)]"
                    style={{ animationDelay: `${idx * 1.3}s` }}
                  >
                    <Mockup />
                  </div>
                </div>
                <div className={isOdd ? "md:order-2" : "md:order-1"}>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {t(($) => $.features.items[key].title)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(($) => $.features.items[key].body)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function KnowledgeBaseMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">Knowledge Base</span>
      </div>
      <div className="p-4 space-y-2">
        {[
          { name: "Slack", done: true },
          { name: "Codebase", done: true },
          { name: "Confluence", done: true },
          { name: "Meeting notes", done: true },
        ].map((src) => (
          <div
            key={src.name}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2"
          >
            <span className="text-sm text-foreground">{src.name}</span>
            {src.done ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <Check className="size-3" aria-hidden /> Synced
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Pending</span>
            )}
          </div>
        ))}
        <div className="pt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Indexed</span>
            <span>94%</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-full w-[94%] rounded-full bg-brand" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProactiveActionMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">ENG-152</span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">
          API rate limiter needs configuration
        </p>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <Bot className="size-3" aria-hidden />
            </span>
            <div>
              <span className="font-medium text-foreground">Atlas</span>{" "}
              <span className="text-muted-foreground">
                commented: &quot;I&apos;ve added rate limiter config. Moving to review.&quot;
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <Bot className="size-3" aria-hidden />
            </span>
            <div>
              <span className="font-medium text-foreground">Atlas</span>{" "}
              <span className="text-muted-foreground">changed status to In Review</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrgMemoryMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">Org Memory</span>
      </div>
      <div className="p-4 space-y-2">
        {[
          { label: "Decisions", detail: "Use PostgreSQL for all new services" },
          { label: "Patterns", detail: "REST APIs follow /api/v1 convention" },
          { label: "Preferences", detail: "Squash-merge PRs, conventional commits" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border/60 bg-background px-3 py-2"
          >
            <p className="text-xs font-medium text-brand">{card.label}</p>
            <p className="text-xs text-muted-foreground">{card.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimezoneMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">Timeline</span>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" aria-hidden />
          <span>11 PM – 6 AM · Team offline</span>
        </div>
        {[
          { title: "Fix flaky auth test", time: "11:14 PM" },
          { title: "Update CI config", time: "2:37 AM" },
          { title: "Refactor rate limiter", time: "5:02 AM" },
        ].map((task) => (
          <div
            key={task.title}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <Check className="size-3 text-success" aria-hidden />
              <span className="text-sm text-foreground">{task.title}</span>
            </div>
            <span className="text-xs text-muted-foreground">{task.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}