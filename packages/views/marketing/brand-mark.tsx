"use client";

/**
 * The "T" wordmark used in the public landing surface. Deliberately a
 * letter inside a brand-coloured square — different from the in-app
 * flame mark in `@teamify/ui/components/common/teamify-icon`, which
 * represents the product at work. Putting the two on the same screen
 * (e.g. in the authenticated app) would feel busy, so the marketing
 * surface gets its own.
 */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-brand font-heading font-semibold text-brand-foreground ${dim}`}
      aria-hidden
    >
      T
    </span>
  );
}
