"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  Database,
  LockKeyhole,
  PackageSearch,
  RefreshCw,
  Search,
  Truck,
  Warehouse,
} from "lucide-react";
import { workspaceInventoryStockOptions } from "@teamify/core/inventory";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@teamify/ui/components/ui/select";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@teamify/ui/components/ui/table";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../../i18n";

export type InventoryStockAvailability =
  | "checking"
  | "available"
  | "not-configured"
  | "unavailable";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const formatQuantity = (value?: number | null) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value ?? 0);

export function InventoryStockPanel({
  wsId,
  availability,
  onRetryAvailability,
}: {
  wsId: string;
  availability: InventoryStockAvailability;
  onRetryAvailability: () => void;
}) {
  const { t } = useT("inventory");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [warehouseNo, setWarehouseNo] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const query = useQuery(
    workspaceInventoryStockOptions(wsId, {
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(warehouseNo !== "all" ? { warehouseNo } : {}),
      page,
      pageSize: PAGE_SIZE,
      enabled: availability === "available",
    }),
  );
  const data = query.data;
  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const warehouses = data?.warehouses ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = debouncedSearch.length > 0 || warehouseNo !== "all";
  const warehouseTypeLabels: Record<string, string> = {
    cloud: t(($) => $.stock.warehouse_types.cloud),
    platform: t(($) => $.stock.warehouse_types.platform),
    offline: t(($) => $.stock.warehouse_types.offline),
    factory: t(($) => $.stock.warehouse_types.factory),
    lofi: t(($) => $.stock.warehouse_types.lofi),
    package: t(($) => $.stock.warehouse_types.package),
    external: t(($) => $.stock.warehouse_types.external),
    other: t(($) => $.stock.warehouse_types.other),
  };

  return (
    <section
      aria-labelledby="inventory-stock-title"
      aria-busy={availability === "available" && query.isFetching}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Warehouse className="size-4 text-primary" />
            <h2 id="inventory-stock-title" className="text-sm font-semibold">
              {t(($) => $.stock.title)}
            </h2>
            {data?.snapshot_date ? (
              <Badge variant="outline" className="font-mono text-[10px] font-normal">
                {t(($) => $.stock.snapshot_badge, { date: data.snapshot_date })}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t(($) => $.stock.subtitle)}
          </p>
        </div>
        {availability === "available" && query.isFetching && !query.isLoading ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
            <RefreshCw className="size-3 animate-spin" />
            {t(($) => $.stock.refreshing)}
          </div>
        ) : null}
      </div>

      {availability === "checking" ? (
        <StockLoadingState />
      ) : availability === "not-configured" ? (
        <StockMessageState
          icon={Database}
          title={t(($) => $.stock.not_configured)}
          detail={t(($) => $.stock.not_configured_detail)}
        />
      ) : availability === "unavailable" ? (
        <StockMessageState
          icon={AlertTriangle}
          destructive
          title={t(($) => $.stock.unavailable)}
          detail={t(($) => $.stock.unavailable_detail)}
          action={
            <Button size="sm" variant="outline" onClick={onRetryAvailability}>
              {t(($) => $.stock.retry)}
            </Button>
          }
        />
      ) : query.isLoading ? (
        <StockLoadingState />
      ) : query.isError && !data ? (
        <StockMessageState
          icon={AlertTriangle}
          destructive
          title={t(($) => $.stock.unavailable)}
          detail={t(($) => $.stock.query_error_detail)}
          action={
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              {t(($) => $.stock.retry)}
            </Button>
          }
        />
      ) : (
        <>
          {query.isRefetchError && data ? (
            <div
              className="flex flex-col gap-3 border-b border-warning/30 bg-warning/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              role="status"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                <div>
                  <p className="text-xs font-medium">{t(($) => $.stock.refresh_failed)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(($) => $.stock.refresh_failed_detail)}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                {t(($) => $.stock.retry)}
              </Button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 border-b md:grid-cols-3 xl:grid-cols-5">
            <StockMetric
              icon={Boxes}
              label={t(($) => $.stock.metrics.available)}
              value={formatQuantity(summary?.qty_available)}
              emphasized
            />
            <StockMetric
              icon={PackageSearch}
              label={t(($) => $.stock.metrics.on_hand)}
              value={formatQuantity(summary?.qty_on_hand)}
            />
            <StockMetric
              icon={LockKeyhole}
              label={t(($) => $.stock.metrics.committed)}
              value={formatQuantity(
                (summary?.qty_locked ?? 0) + (summary?.qty_reserved ?? 0),
              )}
              note={t(($) => $.stock.metrics.committed_note, {
                locked: formatQuantity(summary?.qty_locked),
                reserved: formatQuantity(summary?.qty_reserved),
              })}
            />
            <StockMetric
              icon={Truck}
              label={t(($) => $.stock.metrics.in_transit)}
              value={formatQuantity(summary?.qty_in_transit)}
            />
            <StockMetric
              icon={Warehouse}
              label={t(($) => $.stock.metrics.scope)}
              value={t(($) => $.stock.metrics.scope_value, {
                goods: summary?.goods_count ?? 0,
                warehouses: summary?.warehouse_count ?? 0,
              })}
              note={t(($) => $.stock.metrics.scope_note, {
                records: summary?.record_count ?? 0,
              })}
            />
          </div>

          <div className="flex flex-col gap-3 border-b bg-muted/10 p-4 md:flex-row md:items-center">
            <div className="relative md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                maxLength={200}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                className="pl-9"
                aria-label={t(($) => $.stock.search_label)}
                placeholder={t(($) => $.stock.search_placeholder)}
              />
            </div>
            <Select
              value={warehouseNo}
              onValueChange={(value) => {
                setWarehouseNo(value ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger
                className="md:w-64"
                aria-label={t(($) => $.stock.warehouse_filter_label)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(($) => $.stock.all_warehouses)}</SelectItem>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.warehouse_no} value={warehouse.warehouse_no}>
                    {warehouse.warehouse_name || warehouse.warehouse_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="md:ml-auto">
              <p className="font-mono text-[11px] text-muted-foreground">
                {t(($) => $.stock.result_count, { total })}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-64">{t(($) => $.stock.table.product)}</TableHead>
                  <TableHead className="min-w-56">{t(($) => $.stock.table.warehouse)}</TableHead>
                  <TableHead>{t(($) => $.stock.table.unit_batches)}</TableHead>
                  <TableHead className="text-right">{t(($) => $.stock.table.available)}</TableHead>
                  <TableHead className="text-right">{t(($) => $.stock.table.on_hand)}</TableHead>
                  <TableHead className="text-right">{t(($) => $.stock.table.committed)}</TableHead>
                  <TableHead className="text-right">{t(($) => $.stock.table.in_transit)}</TableHead>
                  <TableHead className="text-right">{t(($) => $.stock.table.damaged)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.goods_no}:${row.warehouse_no}`}>
                    <TableCell>
                      <div className="max-w-80 truncate font-medium" title={row.goods_name || row.goods_no}>
                        {row.goods_name || row.goods_no}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {row.goods_no}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.warehouse_name || row.warehouse_no}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-mono">{row.warehouse_no}</span>
                        {row.warehouse_type ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{warehouseTypeLabels[row.warehouse_type] ?? row.warehouse_type}</span>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{row.unit_name || "—"}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(($) => $.stock.batch_count, { count: row.batch_count ?? 0 })}
                      </div>
                    </TableCell>
                    <QuantityCell value={row.qty_available} strong />
                    <QuantityCell value={row.qty_on_hand} />
                    <TableCell className="text-right">
                      <div className="font-mono tabular-nums">
                        {formatQuantity((row.qty_locked ?? 0) + (row.qty_reserved ?? 0))}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {formatQuantity(row.qty_locked)} + {formatQuantity(row.qty_reserved)}
                      </div>
                    </TableCell>
                    <QuantityCell value={row.qty_in_transit} />
                    <QuantityCell value={row.qty_damaged} muted={(row.qty_damaged ?? 0) === 0} />
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-52 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <PackageSearch className="size-6 text-muted-foreground/60" />
                        <p className="mt-3 text-sm font-medium">
                          {hasFilters ? t(($) => $.stock.no_matches) : t(($) => $.stock.no_data)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {hasFilters
                            ? t(($) => $.stock.no_matches_detail)
                            : t(($) => $.stock.no_data_detail)}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t(($) => $.stock.pagination, { page, pages: pageCount, total })}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t(($) => $.previous)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pageCount || query.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                {t(($) => $.next)}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StockLoadingState() {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-10 w-full md:w-[35rem]" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function StockMessageState({
  icon: Icon,
  title,
  detail,
  action,
  destructive,
}: {
  icon: typeof Database;
  title: string;
  detail: string;
  action?: ReactNode;
  destructive?: boolean;
}) {
  return (
    <div className="flex min-h-72 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div
          className={cn(
            "mx-auto flex size-10 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground",
            destructive && "border-destructive/20 bg-destructive/5 text-destructive",
          )}
        >
          <Icon className="size-4" />
        </div>
        <p className="mt-3 text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

function StockMetric({
  icon: Icon,
  label,
  value,
  note,
  emphasized,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  note?: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-r p-4 last:border-r-0 xl:border-b-0">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className={cn("size-3.5", emphasized && "text-primary")} />
        <span>{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 truncate font-mono text-xl font-semibold tabular-nums tracking-tight",
          emphasized && "text-primary",
        )}
        title={value}
      >
        {value}
      </p>
      {note ? <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function QuantityCell({
  value,
  strong,
  muted,
}: {
  value?: number | null;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right font-mono tabular-nums",
        strong && "font-semibold text-foreground",
        muted && "text-muted-foreground",
      )}
    >
      {formatQuantity(value)}
    </TableCell>
  );
}
