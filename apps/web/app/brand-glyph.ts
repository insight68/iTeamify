/**
 * The iteamify mark as a data URI, for renderers that cannot resolve a URL.
 *
 * `next/og` draws its JSX through satori, which can only resolve `src` from a
 * URL it can fetch — and pointing that at `/brand/iteamify-icon.png` would put a
 * build-time HTTP round trip on the OG route's critical path. Inlining a 160px
 * raster keeps the route self-contained and stays well above the 51px the
 * lockup renders it at. Same trade-off `@iteamify/ui`'s `ITeamifyIcon` makes.
 *
 * Both literals below are written by `scripts/generate-brand-assets.mjs` from
 * `public/brand/iteamify-icon.svg` — edit the script, not the base64.
 */

/**
 * Fraction of the square canvas the glyph's ink covers.
 *
 * The raster is a portrait glyph centred in a square, so a box sized for the
 * ink alone would clip it. Anything laying the mark out by cap height has to
 * divide by this; see `og-brand.tsx`.
 */
export const BRAND_GLYPH_INK_RATIO = 15 / 16;

export const BRAND_GLYPH_DATA_URI =
  "data:image/png;base64,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";

