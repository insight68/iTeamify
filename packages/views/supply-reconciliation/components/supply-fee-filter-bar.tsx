"use client";

import { FilterX, Search } from "lucide-react";
import type { SupplyFeeConfig, SupplyFeeFilters } from "@teamify/core/supply-reconciliation";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Label } from "@teamify/ui/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@teamify/ui/components/ui/select";
import { useT } from "../../i18n";

const ALL = "__all__";

export function SupplyFeeFilterBar({
  config,
  filters,
  onPatch,
  onClear,
  extended = false,
}: {
  config?: SupplyFeeConfig;
  filters: SupplyFeeFilters;
  onPatch: (filters: Partial<SupplyFeeFilters>) => void;
  onClear: () => void;
  extended?: boolean;
}) {
  const { t } = useT("supply-reconciliation");
  const feeLabel = (value: string) => value === "freight"
    ? t(($) => $.fee_types.freight)
    : value === "outbound_handling"
      ? t(($) => $.fee_types.outbound_handling)
      : value === "storage"
        ? t(($) => $.fee_types.storage)
        : value;
  const statusLabel = (value: string) => value === "matched"
    ? t(($) => $.statuses.matched)
    : value === "diff"
      ? t(($) => $.statuses.diff)
      : value === "only_bill"
        ? t(($) => $.statuses.only_bill)
        : value === "only_expected"
          ? t(($) => $.statuses.only_expected)
          : value === "invalid_data"
            ? t(($) => $.statuses.invalid_data)
            : value;
  const active = Object.values(filters).some(Boolean);

  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="supply-fee-date-from" className="text-[11px] text-muted-foreground">{t(($) => $.filters.date_from)}</Label>
          <Input id="supply-fee-date-from" type="date" value={filters.date_from ?? ""} onChange={(event) => onPatch({ date_from: event.target.value || undefined })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="supply-fee-date-to" className="text-[11px] text-muted-foreground">{t(($) => $.filters.date_to)}</Label>
          <Input id="supply-fee-date-to" type="date" value={filters.date_to ?? ""} onChange={(event) => onPatch({ date_to: event.target.value || undefined })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{t(($) => $.filters.provider)}</Label>
          <Select value={filters.provider_id || ALL} onValueChange={(value) => onPatch({ provider_id: value === ALL ? undefined : value ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(($) => $.filters.all_providers)}</SelectItem>
              {(config?.providers ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{t(($) => $.filters.warehouse)}</Label>
          <Select value={filters.warehouse_no || ALL} onValueChange={(value) => onPatch({ warehouse_no: value === ALL ? undefined : value ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(($) => $.filters.all_warehouses)}</SelectItem>
              {(config?.warehouses ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{t(($) => $.filters.fee_type)}</Label>
          <Select value={filters.fee_type || ALL} onValueChange={(value) => onPatch({ fee_type: value === ALL ? undefined : value ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(($) => $.filters.all_fee_types)}</SelectItem>
              {(config?.fee_types ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{feeLabel(option.value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{t(($) => $.filters.status)}</Label>
          <Select value={filters.result_status || ALL} onValueChange={(value) => onPatch({ result_status: value === ALL ? undefined : value ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(($) => $.filters.all_statuses)}</SelectItem>
              {(config?.statuses ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{statusLabel(option.value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-end">
        <div className="w-full lg:w-56">
          <Label className="mb-1.5 block text-[11px] text-muted-foreground">{t(($) => $.filters.reason)}</Label>
          <Select value={filters.reason_code || ALL} onValueChange={(value) => onPatch({ reason_code: value === ALL ? undefined : value ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(($) => $.filters.all_reasons)}</SelectItem>
              {(config?.reasons ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative min-w-0 flex-1">
          <Label htmlFor="supply-fee-sku" className="mb-1.5 block text-[11px] text-muted-foreground">{t(($) => $.filters.sku)}</Label>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 size-3.5 text-muted-foreground" />
          <Input id="supply-fee-sku" className="pl-9" value={filters.sku ?? ""} placeholder={t(($) => $.filters.sku_placeholder)} onChange={(event) => onPatch({ sku: event.target.value || undefined })} />
        </div>
        {extended && (
          <>
            <div className="min-w-0 flex-1">
              <Label htmlFor="supply-fee-order" className="mb-1.5 block text-[11px] text-muted-foreground">{t(($) => $.filters.order)}</Label>
              <Input id="supply-fee-order" value={filters.order_no ?? ""} placeholder={t(($) => $.filters.order_placeholder)} onChange={(event) => onPatch({ order_no: event.target.value || undefined })} />
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="supply-fee-logistics" className="mb-1.5 block text-[11px] text-muted-foreground">{t(($) => $.filters.logistics)}</Label>
              <Input id="supply-fee-logistics" value={filters.logistics_no ?? ""} placeholder={t(($) => $.filters.logistics_placeholder)} onChange={(event) => onPatch({ logistics_no: event.target.value || undefined })} />
            </div>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={!active} onClick={onClear}>
          <FilterX className="size-3.5" />
          {t(($) => $.filters.clear)}
        </Button>
      </div>
    </section>
  );
}
