"use client";

import {
  ArrowRight,
  CheckCircle2,
  UsersRound,
} from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";

/**
 * Above-fold positioning on the left, real operating visual on the right.
 */
export function HeroSection() {
  const { t } = useT("marketing");

  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in oklab, var(--border) 72%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--border) 72%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "linear-gradient(to bottom, black, transparent 82%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--brand)_16%,transparent),transparent_64%)]"
      />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-14 md:px-6 md:pb-16 md:pt-20 lg:grid-cols-[1.08fr_0.82fr] lg:items-center lg:pb-16 lg:pt-24">
        <div className="max-w-2xl">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            {t(($) => $.hero.eyebrow)}
          </span>
          <h1 className="mt-5 text-balance font-serif text-4xl font-normal leading-[1.04] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {t(($) => $.hero.headline)}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            {t(($) => $.hero.sub_headline)}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <AppLink
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(($) => $.hero.primary_cta)}
              <ArrowRight className="size-4" aria-hidden />
            </AppLink>
            <AppLink
              href="#customers"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              <UsersRound className="size-4 text-brand" aria-hidden />
              {t(($) => $.hero.secondary_cta)}
            </AppLink>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  const { t } = useT("marketing");

  return (
    <div className="relative mx-auto w-full max-w-[420px] lg:mr-0 xl:max-w-[450px]">
      <img
        src="/marketing/hero-inventory-dashboard.webp"
        alt={t(($) => $.hero.visual.alt)}
        className="block w-full object-contain"
        loading="eager"
        // fetchPriority=high tells the browser to start fetching the LCP image
        // immediately (ahead of other eager assets). decoding=async keeps the
        // main thread free during image decode. width/height prevent CLS.
        fetchPriority="high"
        decoding="async"
        width={770}
        height={854}
      />
    </div>
  );
}
