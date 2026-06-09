"use client";

import { useMemo } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { useT } from "../i18n";
import { AppLink } from "../navigation";
import { HeroMockup } from "./hero-mockup";
import { AttributePills } from "./attribute-pills";

/** Deterministic pseudo-random for SSR consistency. */
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const STAR_COUNT = 80;

/**
 * Hero section with star-dust particle background, subtle grid texture,
 * gradient headline, CTAs, agent mockup, and attribute pills. Star
 * positions are deterministic via seeded random to avoid hydration
 * mismatches between server and client.
 */
export function HeroSection() {
  const { t } = useT("marketing");

  return (
    <section className="relative overflow-hidden">
      <StarDustBackground />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--brand)_18%,transparent),transparent_60%)]"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-8 pt-16 md:px-6 md:pt-24 lg:pb-12 lg:pt-32">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 inline-flex w-fit items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t(($) => $.hero.eyebrow)}
          </span>
          <h1 className="font-serif text-4xl font-normal leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            {t(($) => $.hero.headline_line1)}{" "}
            <span className="bg-gradient-to-br from-brand via-brand to-primary bg-clip-text italic text-transparent">
              {t(($) => $.hero.headline_emphasis)}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl">
            {t(($) => $.hero.subtitle)}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <AppLink
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(($) => $.hero.primary_cta)}
              <ArrowRight className="size-4" aria-hidden />
            </AppLink>
            <AppLink
              href="/docs"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <BookOpen className="size-4" aria-hidden />
              {t(($) => $.hero.secondary_cta)}
            </AppLink>
          </div>
        </div>
        <div className="mt-12 md:mt-16">
          <HeroMockup />
        </div>
        <AttributePills />
      </div>
    </section>
  );
}

/** Star-dust particles + subtle grid texture for the deep-space hero. */
function StarDustBackground() {
  const stars = useMemo(() => {
    const result: { x: number; y: number; size: number; delay: number; duration: number }[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      result.push({
        x: seededRandom(i * 3 + 1) * 100,
        y: seededRandom(i * 3 + 2) * 100,
        size: seededRandom(i * 3 + 3) * 1.5 + 1,
        delay: seededRandom(i * 7 + 11) * 5,
        duration: seededRandom(i * 13 + 23) * 3 + 2,
      });
    }
    return result;
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Star particles */}
      {stars.map((star, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-brand animate-star-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, var(--brand) 1px, transparent 1px), linear-gradient(to bottom, var(--brand) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}
