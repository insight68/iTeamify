"use client";

import { useT } from "../i18n";

const TESTIMONIAL_KEYS = ["live_stream", "multi_platform", "agency"] as const;

/**
 * Customer testimonials organized by industry segment.
 */
export function TestimonialsSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.testimonials.eyebrow)}
          </p>
          <h2
            id="testimonials-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.testimonials.heading)}
          </h2>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {TESTIMONIAL_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:p-8"
            >
              <div className="mb-4 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                {t(($) => $.testimonials.items[key].segment)}
              </div>
              <blockquote className="mb-4 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{t(($) => $.testimonials.items[key].quote)}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {t(($) => $.testimonials.items[key].author_initial)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t(($) => $.testimonials.items[key].author)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(($) => $.testimonials.items[key].role)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
