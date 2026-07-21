"use client";

import { useT } from "../i18n";

const CASE_KEYS = ["commerce", "supply_chain"] as const;
const TAG_KEYS = ["tag_1", "tag_2", "tag_3"] as const;

const CASE_IMAGES = {
  commerce: {
    src: "/marketing/procurement-assistant-workbench.jpg",
    width: 3236,
    height: 2160,
  },
  supply_chain: {
    src: "/marketing/hero-inventory-dashboard.webp",
    width: 1082,
    height: 1112,
  },
} satisfies Record<
  (typeof CASE_KEYS)[number],
  { src: string; width: number; height: number }
>;

/**
 * Customer-story cards modeled after editorial case studies: image first,
 * business context next, and a concrete operator quote at the end.
 */
export function CustomerCasesSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="customers"
      aria-labelledby="customers-heading"
      className="border-b border-border/60 bg-muted/20 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand">
              {t(($) => $.customers.eyebrow)}
            </p>
            <h2
              id="customers-heading"
              className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
            >
              {t(($) => $.customers.heading)}
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            {t(($) => $.customers.body)}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {CASE_KEYS.map((key) => {
            const image = CASE_IMAGES[key];

            return (
              <article
                key={key}
                className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm"
              >
                <img
                  src={image.src}
                  alt={t(($) => $.customers.items[key].image_alt)}
                  className="aspect-[16/7] w-full bg-muted object-cover object-top"
                  loading="lazy"
                  decoding="async"
                  width={image.width}
                  height={image.height}
                />

                <div className="p-6 md:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
                        {t(($) => $.customers.items[key].company)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(($) => $.customers.items[key].industry)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {TAG_KEYS.map((tagKey) => (
                        <span
                          key={tagKey}
                          className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-foreground"
                        >
                          {t(($) => $.customers.items[key][tagKey])}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="mt-8 text-sm leading-7 text-muted-foreground">
                    {t(($) => $.customers.items[key].summary)}
                  </p>

                  <blockquote className="mt-7 border-l border-brand/40 pl-5 font-serif text-2xl font-normal leading-snug tracking-tight text-foreground md:text-3xl">
                    &ldquo;{t(($) => $.customers.items[key].quote)}&rdquo;
                  </blockquote>

                  <div className="mt-8 flex items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-foreground">
                      {t(($) => $.customers.items[key].author_initial)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t(($) => $.customers.items[key].author)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(($) => $.customers.items[key].role)}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
