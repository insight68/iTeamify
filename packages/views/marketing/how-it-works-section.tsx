"use client";

import type { FC } from "react";
import { Bot, Check } from "lucide-react";
import { useT } from "../i18n";

const STEP_KEYS = ["workspace", "runtime", "assign"] as const;

const STEP_MOCKUPS: FC[] = [WorkspaceMockup, RuntimeMockup, AssignMockup];

/**
 * Three-step "how it works" with alternating mockup + text layout.
 * Each step shows a CSS-only mockup on one side and descriptive text
 * on the other, alternating left/right on md+ screens.
 */
export function HowItWorksSection() {
  const { t } = useT("marketing");
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="border-b border-border/60 bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.how_it_works.eyebrow)}
          </p>
          <h2
            id="how-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.how_it_works.heading)}
          </h2>
        </div>
        <div className="mt-14 space-y-16 md:space-y-20">
          {STEP_KEYS.map((key, idx) => {
            const Mockup = STEP_MOCKUPS[idx]!;
            const isEven = idx % 2 === 0;
            return (
              <div
                key={key}
                className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
              >
                <div className={isEven ? "md:order-1" : "md:order-2"}>
                  <div className="animate-mockup-float" style={{ animationDelay: `${idx * 1.3}s` }}>
                    <Mockup />
                  </div>
                </div>
                <div className={isEven ? "md:order-2" : "md:order-1"}>
                  <span
                    aria-hidden
                    className="mb-3 inline-flex size-10 items-center justify-center rounded-full border-4 border-muted/50 bg-brand font-heading text-base font-semibold text-brand-foreground shadow-[0_0_15px_color-mix(in_oklab,var(--brand)_40%,transparent)]"
                  >
                    {idx + 1}
                  </span>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {t(($) => $.how_it_works.steps[key].title)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(($) => $.how_it_works.steps[key].body)}
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

function WorkspaceMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">New Workspace</span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Workspace name</label>
          <div className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            Acme Corp
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Team members</label>
          <div className="mt-1 flex items-center gap-1">
            {["A", "B", "C"].map((initial) => (
              <span
                key={initial}
                className="inline-flex size-7 items-center justify-center rounded-full bg-brand/10 text-xs font-medium text-brand"
              >
                {initial}
              </span>
            ))}
            <span className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
              +
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground">
          Create Workspace
        </div>
      </div>
    </div>
  );
}

function RuntimeMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">Connected Runtimes</span>
      </div>
      <div className="p-4 space-y-2">
        {[
          { name: "Claude Code", status: "connected" as const },
          { name: "Codex", status: "connected" as const },
          { name: "Copilot CLI", status: "pending" as const },
        ].map((rt) => (
          <div
            key={rt.name}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2"
          >
            <span className="text-sm text-foreground">{rt.name}</span>
            {rt.status === "connected" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <Check className="size-3" aria-hidden /> Connected
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="size-2.5 rounded-full bg-muted" />
        <span className="ml-2 text-xs text-muted-foreground">ENG-147</span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">
          Implement rate limiter middleware
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-purple-100 text-purple-700">
            <Bot className="size-3" aria-hidden />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            Atlas picked up this issue
          </span>
        </div>
      </div>
    </div>
  );
}