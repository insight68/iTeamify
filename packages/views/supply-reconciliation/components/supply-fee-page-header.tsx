"use client";

import { Clock3, RefreshCw, Scale } from "lucide-react";
import { Button } from "@teamify/ui/components/ui/button";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../../i18n";
import { SupplyFeeSectionNav } from "./supply-fee-section-nav";

function formatRunTime(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function SupplyFeePageHeader({
  latestRunNo = "",
  latestRunAt = "",
  refreshing = false,
  onRefresh,
}: {
  latestRunNo?: string;
  latestRunAt?: string;
  refreshing?: boolean;
  onRefresh: () => void;
}) {
  const { t } = useT("supply-reconciliation");
  return (
    <header className="shrink-0 border-b bg-card/70 px-5 pt-4 backdrop-blur-sm md:px-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-md border border-primary/20 bg-primary/10 p-1.5 text-primary">
              <Scale className="size-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t(($) => $.title)}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.subtitle)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            <span>
              {latestRunNo
                ? `${t(($) => $.latest_run, { run: latestRunNo })}${latestRunAt ? ` · ${t(($) => $.updated_at, { time: formatRunTime(latestRunAt) })}` : ""}`
                : t(($) => $.no_successful_run)}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            {t(($) => $.refresh)}
          </Button>
        </div>
      </div>
      <SupplyFeeSectionNav />
    </header>
  );
}
