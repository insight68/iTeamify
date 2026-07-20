"use client";

import { ArrowUpRight } from "lucide-react";
import type { SupplyFeeResultRow } from "@teamify/core/supply-reconciliation";
import { Button } from "@teamify/ui/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@teamify/ui/components/ui/table";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../../i18n";
import { SupplyFeeStatusBadge } from "./supply-fee-status-badge";

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return numberFormatter.format(value);
  }
}

export function SupplyFeeResultsTable({
  rows,
  currency = "CNY",
  onOpen,
  compact = false,
}: {
  rows: SupplyFeeResultRow[];
  currency?: string;
  onOpen: (resultId: string) => void;
  compact?: boolean;
}) {
  const { t } = useT("supply-reconciliation");
  const feeLabel = (value: string) => value === "freight"
    ? t(($) => $.fee_types.freight)
    : value === "outbound_handling"
      ? t(($) => $.fee_types.outbound_handling)
      : value === "storage"
        ? t(($) => $.fee_types.storage)
        : value;

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1180px]">
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>{t(($) => $.table.date)}</TableHead>
            <TableHead>{t(($) => $.table.provider)}</TableHead>
            <TableHead>{t(($) => $.table.fee)}</TableHead>
            {!compact && <TableHead>{t(($) => $.table.warehouse)}</TableHead>}
            {!compact && <TableHead>{t(($) => $.table.order_tracking)}</TableHead>}
            <TableHead>{t(($) => $.table.sku)}</TableHead>
            <TableHead className="text-right">{t(($) => $.table.quantity)}</TableHead>
            <TableHead className="text-right">{t(($) => $.table.billed)}</TableHead>
            <TableHead className="text-right">{t(($) => $.table.expected)}</TableHead>
            <TableHead className="text-right">{t(($) => $.table.difference)}</TableHead>
            <TableHead>{t(($) => $.table.status)}</TableHead>
            {!compact && <TableHead>{t(($) => $.table.reason)}</TableHead>}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={`${row.result_id}-${row.line_id}`}
              className="group cursor-pointer"
              tabIndex={0}
              onClick={() => onOpen(row.result_id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(row.result_id);
                }
              }}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">{row.charge_date || "—"}</TableCell>
              <TableCell className="max-w-40 truncate font-medium">{row.provider_name || "—"}</TableCell>
              <TableCell><span className="rounded border bg-muted/30 px-2 py-1 text-xs">{feeLabel(row.fee_type)}</span></TableCell>
              {!compact && <TableCell className="font-mono text-xs">{row.warehouse_no || "—"}</TableCell>}
              {!compact && (
                <TableCell>
                  <div className="max-w-44 space-y-0.5 font-mono text-[11px]">
                    <p className="truncate text-foreground">{row.order_no || "—"}</p>
                    <p className="truncate text-muted-foreground">{row.logistics_no || "—"}</p>
                  </div>
                </TableCell>
              )}
              <TableCell>
                <div className="max-w-52">
                  <p className="truncate font-mono text-xs font-medium">{row.sku_code || "—"}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.sku_name || "—"}</p>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{numberFormatter.format(row.quantity)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatMoney(row.billed_amount, currency)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatMoney(row.expected_amount, currency)}</TableCell>
              <TableCell className={cn("text-right font-mono text-xs font-semibold", row.diff_amount > 0 ? "text-destructive" : row.diff_amount < 0 ? "text-info" : "text-muted-foreground")}>
                {formatMoney(row.diff_amount, currency)}
              </TableCell>
              <TableCell><SupplyFeeStatusBadge status={row.result_status} /></TableCell>
              {!compact && <TableCell className="max-w-36 truncate font-mono text-[11px] text-muted-foreground" title={row.reason_code}>{row.reason_code || "—"}</TableCell>}
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t(($) => $.actions.view_evidence)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(row.result_id);
                  }}
                >
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
