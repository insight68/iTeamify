/* eslint-disable @next/next/no-img-element -- Brand marks ship pre-exported at
   roughly 3x the largest display size, so the Next image optimizer has nothing
   to gain here. Keeping them as plain <img> also avoids pulling the optimizer
   into the critical path of the site's most prominent brand element. */

import { cn } from "@iteamify/ui/lib/utils";

const ICON_SRC = "/brand/iteamify-icon.png";

type BrandMarkTone = "brand" | "mono";

/**
 * Square brand glyph — the same artwork the favicon and the app icons use. The
 * mark is a teal-to-blue sweep, so it reads on both light and dark surfaces;
 * there is no per-surface colour variant. `tone="mono"` flattens it to a
 * silhouette for decorative watermarks.
 */
export function BrandMark({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: BrandMarkTone;
}) {
  return (
    <img
      src={ICON_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn(
        "shrink-0 select-none object-contain",
        tone === "mono" && "brightness-0",
        className,
      )}
    />
  );
}

/**
 * Locales the marketing shell ships, declared locally rather than imported from
 * `../i18n`: this module is also reached from server components (the login
 * route imports `BrandMark`), and `../i18n` pulls in `next/navigation`.
 */
export type BrandLogoLocale = "en" | "zh-Hans";

/**
 * Wordmark copy, per locale.
 *
 * The wordmark is live text rather than artwork so it localises with the page
 * and stays crisp at every density. `lead`/`tail` keep the two-weight treatment
 * available for locales that need it — the brand is a single lowercase word in
 * both of ours, so `lead` carries the whole name and `tail` stays empty.
 * `slogan` is the descriptor from the brand sheet.
 *
 * `name` is the accessible name for the logo link. It has to match the visible
 * wordmark (WCAG 2.5.3), which is why it is derived from the same table.
 */
const BRAND_COPY: Record<
  BrandLogoLocale,
  { lead: string; tail: string; separator: string; name: string; slogan: string }
> = {
  en: {
    lead: "iteamify",
    tail: "",
    separator: "",
    name: "iteamify",
    slogan: "AI NATIVE COLLABORATION SYSTEM",
  },
  "zh-Hans": {
    lead: "iteamify",
    tail: "",
    separator: "",
    name: "iteamify",
    slogan: "AI Native 协作系统",
  },
};

/** Accessible name for the logo link: the wordmark exactly as it is rendered. */
export function brandLogoName(locale: BrandLogoLocale): string {
  return BRAND_COPY[locale].name;
}

/**
 * Header/footer lockup: the favicon glyph plus a localised text wordmark and
 * slogan. Sizing lives in `service-marketing.css` so the two consumers — and
 * the responsive steps between them — stay consistent.
 */
export function BrandLogo({
  locale,
  className,
}: {
  locale: BrandLogoLocale;
  className?: string;
}) {
  const copy = BRAND_COPY[locale];
  return (
    <span className={cn("service-logo-lockup", className)} data-lang={locale}>
      <BrandMark className="service-logo-mark" />
      <span className="service-logo-text">
        <span className="service-logo-wordmark">
          <span className="service-logo-strong">{copy.lead}</span>
          {copy.separator ? (
            <span className="service-logo-dot">{copy.separator}</span>
          ) : null}
          {copy.tail ? <span>{copy.tail}</span> : null}
        </span>
        <span className="service-logo-slogan">{copy.slogan}</span>
      </span>
    </span>
  );
}
