"use client";

import { ArrowRight } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Bottom-of-page CTA with light-tech styling. White card with
 * subtle brand gradient border. The marquee ticker from the footer
 * provides visual continuity above the CTA.
 */
export function CtaSection() {
  const { t } = useT("duizhang");
  return (
    <section
      aria-labelledby="cta-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <div className="relative rounded-2xl border border-border/60 bg-card p-10 text-center shadow-lg ring-1 ring-foreground/5 md:p-14">
          {/* Subtle brand gradient border glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              boxShadow: "inset 0 0 40px color-mix(in oklab, var(--brand) 6%, transparent)",
            }}
          />
          <div className="relative">
            <h2
              id="cta-heading"
              className="font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
            >
              {t(($) => $.cta.heading)}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              {t(($) => $.cta.body)}
            </p>
            <div className="mt-8">
              <AppLink
                href="/signup"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t(($) => $.cta.button)}
                <ArrowRight className="size-4" aria-hidden />
              </AppLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
