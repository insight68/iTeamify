"use client";

import { Badge } from "@teamify/ui/components/ui/badge";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../../i18n";

export function SupplyFeeStatusBadge({ status }: { status: string }) {
  const { t } = useT("supply-reconciliation");
  const label = status === "matched"
    ? t(($) => $.statuses.matched)
    : status === "diff"
      ? t(($) => $.statuses.diff)
      : status === "only_bill"
        ? t(($) => $.statuses.only_bill)
        : status === "only_expected"
          ? t(($) => $.statuses.only_expected)
          : status === "invalid_data"
            ? t(($) => $.statuses.invalid_data)
            : status;
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-mono text-[10px] font-medium tracking-wide",
        status === "matched" && "border-success/30 bg-success/10 text-success",
        status === "diff" && "border-warning/30 bg-warning/10 text-warning-foreground",
        status === "only_bill" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "only_expected" && "border-info/30 bg-info/10 text-info",
        status === "invalid_data" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}
