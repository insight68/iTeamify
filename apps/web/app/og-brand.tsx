/* eslint-disable @next/next/no-img-element -- the OG route renders through
   satori's custom JSX runtime, which has no `next/image` equivalent, and the
   mark is a static data URI with no optimiser work to do. */

import { BRAND_GLYPH_DATA_URI, BRAND_GLYPH_INK_RATIO } from "./brand-glyph";

/** Height of the mark's ink, matched to the wordmark's cap height. */
const MARK_INK = 48;
/**
 * The raster is a portrait glyph centred in a square canvas, so the ink only
 * fills `BRAND_GLYPH_INK_RATIO` of the box. Sizing the box by `MARK_INK` alone
 * would render the mark ~6% short of the wordmark.
 */
const MARK_BOX = Math.round(MARK_INK / BRAND_GLYPH_INK_RATIO);

/**
 * The iteamify lockup for social cards.
 *
 * Satori resolves an image `src` over the network, so the mark ships as an
 * inline data URI rather than a path into `public/` — see `brand-glyph.ts` for
 * the trade-off. The wordmark stays live text so it renders through the same
 * font as the rest of the card.
 */
export function ITeamifyOgLockup() {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: 13,
      }}
    >
      <img alt="" height={MARK_BOX} src={BRAND_GLYPH_DATA_URI} width={MARK_BOX} />
      <div
        style={{
          display: "flex",
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: -1.6,
        }}
      >
        iteamify
      </div>
    </div>
  );
}
