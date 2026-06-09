"use client";

import { useT } from "../i18n";

const STEP_KEYS = ["workspace", "runtime", "assign", "ship"] as const;

/**
 * Four-step "how it works" with alternating mockup + text layout.
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
            const isEven = idx % 2 === 0;
            return (
              <div
                key={key}
                className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
              >
                <div className={isEven ? "md:order-1" : "md:order-2"}>
                  <StepNumber num={idx + 1} />
                </div>
                <div className={isEven ? "md:order-2" : "md:order-1"}>
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

function StepNumber({ num }: { num: number }) {
  return (
    <div className="flex items-center justify-center">
      <span
        aria-hidden
        className="inline-flex size-20 items-center justify-center rounded-2xl border border-border/60 bg-card font-heading text-3xl font-semibold text-brand shadow-lg ring-1 ring-foreground/5"
      >
        {num}
      </span>
    </div>
  );
}