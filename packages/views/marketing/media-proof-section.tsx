"use client";

import { PlayCircle, ReceiptText, ShoppingCart } from "lucide-react";
import { useT } from "../i18n";

const PROCUREMENT_METRICS = ["metric_1", "metric_2"] as const;
const RECONCILIATION_METRICS = ["metric_1", "metric_2"] as const;

/**
 * Uses real product and operating visuals so the homepage feels grounded in
 * concrete workflows rather than generic AI promises.
 */
export function MediaProofSection() {
  const { t } = useT("marketing");

  return (
    <section
      id="scenes"
      aria-labelledby="scenes-heading"
      className="border-b border-border/60 bg-background py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.media.eyebrow)}
          </p>
          <h2
            id="scenes-heading"
            className="mt-2 text-balance font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            {t(($) => $.media.heading)}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {t(($) => $.media.body)}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <article className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
            <div className="p-6 md:p-7">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <ShoppingCart className="size-5" aria-hidden />
                </span>
                <p className="text-xs font-medium uppercase tracking-wider text-brand">
                  {t(($) => $.media.procurement.label)}
                </p>
              </div>
              <h3 className="mt-5 font-heading text-2xl font-semibold leading-tight text-foreground">
                {t(($) => $.media.procurement.title)}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t(($) => $.media.procurement.description)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {PROCUREMENT_METRICS.map((key) => (
                  <span
                    key={key}
                    className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {t(($) => $.media.procurement[key])}
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-border/60 bg-muted/30 p-3">
              <img
                src="/marketing/procurement-assistant-workbench.jpg"
                alt={t(($) => $.media.procurement.image_alt)}
                className="aspect-[16/10] w-full rounded-md border border-border/70 bg-background object-contain"
                loading="lazy"
                decoding="async"
                width={3236}
                height={2160}
              />
            </div>
          </article>

          <article className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
            <div className="p-6 md:p-7">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <ReceiptText className="size-5" aria-hidden />
                </span>
                <p className="text-xs font-medium uppercase tracking-wider text-brand">
                  {t(($) => $.media.reconciliation.label)}
                </p>
              </div>
              <h3 className="mt-5 font-heading text-2xl font-semibold leading-tight text-foreground">
                {t(($) => $.media.reconciliation.title)}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t(($) => $.media.reconciliation.description)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {RECONCILIATION_METRICS.map((key) => (
                  <span
                    key={key}
                    className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {t(($) => $.media.reconciliation[key])}
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-border/60 bg-muted/30 p-3">
              <div className="relative">
                <video
                  aria-label={t(($) => $.media.reconciliation.video_label)}
                  className="aspect-video w-full rounded-md border border-border/70 bg-background object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/marketing/reconciliation-demo-poster.jpg"
                  preload="metadata"
                >
                  <source
                    src="/marketing/reconciliation-demo-preview.mp4"
                    type="video/mp4"
                  />
                  <track
                    kind="captions"
                    src="/marketing/reconciliation-demo-captions.vtt"
                    srcLang={t(($) => $.media.reconciliation.captions_lang)}
                    label={t(($) => $.media.reconciliation.captions_label)}
                    default
                  />
                </video>
                <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-md border border-border/70 bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                  <PlayCircle className="size-4 text-brand" aria-hidden />
                  {t(($) => $.media.reconciliation.video_badge)}
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
