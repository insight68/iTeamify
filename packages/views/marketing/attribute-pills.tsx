"use client";

import { Brain, Fingerprint, Zap } from "lucide-react";
import { useT } from "../i18n";

const PILLS = [
  { key: "real_identity" as const, icon: Fingerprint },
  { key: "org_memory" as const, icon: Brain },
  { key: "self_driven" as const, icon: Zap },
];

/**
 * Three attribute pills below the hero mockup. Each pill highlights a
 * key differentiator of Teamify agents: real identity, org memory, and
 * self-driven initiative. Rendered as inline badges with icons.
 */
export function AttributePills() {
  const { t } = useT("marketing");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
      {PILLS.map(({ key, icon: Icon }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground"
        >
          <Icon className="size-3.5 text-brand" aria-hidden />
          {t(($) => $.hero.pills[key])}
        </span>
      ))}
    </div>
  );
}