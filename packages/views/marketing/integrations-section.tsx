"use client";

import { useT } from "../i18n";

const TOOL_KEYS = [
  "taobao",
  "douyin",
  "pinduoduo",
  "jd",
  "kuaishou",
  "xiaohongshu",
  "weishop",
  "bilibili",
  "shopify",
  "amazon",
  "lazada",
  "shopee",
] as const;

/**
 * Horizontal marquee of supported AI tool names. Duplicated for
 * seamless infinite scroll. Gradient masks on edges fade content
 * in and out.
 */
export function IntegrationsSection() {
  const { t } = useT("marketing");
  const tools = TOOL_KEYS.map((k) => t(($) => $.integrations.tools[k]));

  return (
    <section
      id="integrations"
      aria-labelledby="integrations-heading"
      className="py-16 md:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            {t(($) => $.integrations.eyebrow)}
          </p>
          <h2
            id="integrations-heading"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-foreground sm:text-4xl"
          >
            {t(($) => $.integrations.heading)}
          </h2>
        </div>
      </div>
      <div className="relative mt-10 overflow-hidden">
        {/* Left fade */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent"
        />
        {/* Right fade */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-background to-transparent"
        />
        <div className="flex animate-marquee">
          <ToolTrack tools={tools} />
          <ToolTrack tools={tools} />
        </div>
      </div>
    </section>
  );
}

function ToolTrack({ tools }: { tools: string[] }) {
  return (
    <div className="flex shrink-0 items-center gap-6 px-3">
      {tools.map((tool, i) => (
        <span
          key={`${tool}-${i}`}
          className="inline-flex items-center rounded-lg border border-border/60 bg-card px-5 py-2.5 text-sm font-medium text-foreground whitespace-nowrap"
        >
          {tool}
        </span>
      ))}
    </div>
  );
}