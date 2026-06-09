"use client";

import { useT } from "../i18n";

const ROW1_KEYS = [
  "phrase_1",
  "phrase_2",
  "phrase_3",
  "phrase_4",
  "phrase_5",
  "phrase_6",
  "phrase_7",
  "phrase_8",
] as const;

const ROW2_KEYS = ROW1_KEYS;

/**
 * Dual-row marquee for the footer. Row 1 scrolls forward, row 2 scrolls
 * in reverse, creating a visual counterpoint. Each row renders its
 * content twice for a seamless loop. Gradient masks on edges fade the
 * text in and out.
 */
export function FooterMarquee() {
  const { t } = useT("marketing");

  return (
    <div className="flex flex-col gap-3 overflow-hidden py-6">
      {/* Row 1 — forward */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent"
        />
        <div className="flex animate-marquee">
          <MarqueeTrack phrases={ROW1_KEYS.map((k) => t(($) => $.footer.marquee.row1[k]))} />
          <MarqueeTrack phrases={ROW1_KEYS.map((k) => t(($) => $.footer.marquee.row1[k]))} />
        </div>
      </div>

      {/* Row 2 — reverse */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent"
        />
        <div className="flex animate-marquee-reverse">
          <MarqueeTrack phrases={ROW2_KEYS.map((k) => t(($) => $.footer.marquee.row2[k]))} />
          <MarqueeTrack phrases={ROW2_KEYS.map((k) => t(($) => $.footer.marquee.row2[k]))} />
        </div>
      </div>
    </div>
  );
}

function MarqueeTrack({ phrases }: { phrases: string[] }) {
  return (
    <div className="flex shrink-0 items-center gap-6 px-3">
      {phrases.map((phrase, i) => (
        <span
          key={`${phrase}-${i}`}
          className="whitespace-nowrap text-sm font-medium text-muted-foreground"
        >
          {phrase}
        </span>
      ))}
    </div>
  );
}