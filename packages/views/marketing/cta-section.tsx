"use client";

import { ArrowRight } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Bottom-of-page CTA. Deep-space card surface with a cyan glow border
 * effect and subtle grid texture. The amber gold button drives signups
 * with maximum visual contrast against the dark card. The decorative
 * grid fades radially so the section doesn't feel like a hard cliff
 * against the footer's muted surface.
 */
export function CtaSection() {
  const { t } = useT("marketing");
  return (
    <section
      aria-labelledby="cta-heading"
      className="relative overflow-hidden bg-card py-20 text-foreground md:py-28"
    >
      {/* Cyan inner glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          boxShadow: "inset 0 0 80px color-mix(in oklab, var(--brand) 10%, transparent)",
        }}
      />
      {/* Grid texture with radial mask */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--brand)_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_6%,transparent)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <div className="relative mx-auto max-w-3xl px-4 text-center md:px-6">
        <h2
          id="cta-heading"
          className="font-serif text-3xl font-normal tracking-tight sm:text-4xl md:text-5xl"
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
    </section>
  );
}
