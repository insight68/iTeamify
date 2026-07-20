"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Clock3,
  Download,
  PackageSearch,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  workspaceInventoryConfigOptions,
  workspaceInventoryMonitorOptions,
  type InventoryMonitorRow,
  type InventoryMonitorSalesMonth,
  type InventoryMonitorTurnoverStatus,
} from "@teamify/core/inventory";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@teamify/ui/components/ui/table";
import { cn } from "@teamify/ui/lib/utils";
import { toast } from "sonner";
import { api } from "@teamify/core/api";
import { BrowserFullscreenFrame } from "../common/browser-fullscreen-frame";
import { downloadBlob } from "../common/download-blob";
import { useT } from "../i18n";
import { InventorySectionNav } from "./components/inventory-section-nav";

const configurationReasons = new Set([
  "data_source_not_configured",
  "table_missing",
  "tables_missing",
]);

const formatQuantity = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);

const formatDateLabel = (date: string, locale: string) => {
  if (!date) return "—";
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime())
    ? date
    : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(value);
};

const formatMonthLabel = (month: string, locale: string) => {
  const value = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(value.getTime())
    ? month
    : new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(value);
};

const dayOfMonth = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? date : String(value.getUTCDate());
};

const salesQuantityForMonth = (row: InventoryMonitorRow, month: string) =>
  row.monthly_sales.find((point) => point.month === month)?.net_sales_qty ?? 0;

const formatShanghaiTime = (value: string) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

function buildInventoryMonitorCsvFileName(title: string, now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const safeTitle = title.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim() || "inventory-monitor";
  return `${safeTitle}-${date}.csv`;
}

const emptyMonitorRows: InventoryMonitorRow[] = [];

function calculateGroupSpans(rows: InventoryMonitorRow[]) {
  const category = new Map<number, number>();
  const series = new Map<number, number>();
  let categoryStart = 0;
  let seriesStart = 0;

  for (let index = 0; index <= rows.length; index++) {
    const current = rows[index];
    const previous = rows[index - 1];
    if (index === rows.length || current?.category_name !== previous?.category_name) {
      if (index > categoryStart) category.set(categoryStart, index - categoryStart);
      categoryStart = index;
    }
    if (
      index === rows.length ||
      current?.category_name !== previous?.category_name ||
      current?.series_name !== previous?.series_name
    ) {
      if (index > seriesStart) series.set(seriesStart, index - seriesStart);
      seriesStart = index;
    }
  }
  return { category, series };
}

function SummaryItem({ label, value, note, warning }: {
  label: string;
  value: string;
  note?: string;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 border-r px-4 py-3 last:border-r-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", warning && "text-destructive")}>{value}</p>
      {note ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function InventoryMonitorPage() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { t, i18n } = useT("inventory");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [series, setSeries] = useState("");
  const [warehouseNo, setWarehouseNo] = useState("");
  const [turnoverStatus, setTurnoverStatus] = useState<InventoryMonitorTurnoverStatus>("all");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const configQuery = useQuery(workspaceInventoryConfigOptions(wsId));
  const monitorAvailable = configQuery.data?.monitor_available === true;
  const monitorQuery = useQuery(workspaceInventoryMonitorOptions(wsId, {
    search,
    category,
    series,
    warehouseNo,
    turnoverStatus,
    enabled: monitorAvailable,
  }));
  const fetchingCount = useIsFetching({ queryKey: ["inventory", wsId] });
  const data = monitorQuery.data;
  const rows = data?.rows ?? emptyMonitorRows;
  const groupSpans = useMemo(() => calculateGroupSpans(rows), [rows]);
  const latestInventoryUpdatedAt = useMemo(() => {
    const timestamps = (data?.meta.inventory_sources ?? [])
      .filter((source) => !warehouseNo || source.warehouse_no === warehouseNo)
      .map((source) => source.updated_at)
      .filter(Boolean)
      .sort();
    return timestamps.at(-1) ?? "";
  }, [data?.meta.inventory_sources, warehouseNo]);
  const selectedWarehouse = data?.warehouses.find((warehouse) => warehouse.warehouse_no === warehouseNo);
  const turnoverStatusLabel = turnoverStatus === "all"
    ? t(($) => $.monitor.filters.all_statuses)
    : t(($) => $.monitor.status[turnoverStatus]);
  const notConfigured = !!configQuery.data
    && !monitorAvailable
    && configurationReasons.has(configQuery.data.monitor_reason);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory", wsId] });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const salesMonths: InventoryMonitorSalesMonth[] = data?.meta.sales_months ?? [];
  const salesMonthLabels = salesMonths.map((month) => {
    const label = formatMonthLabel(month.month, locale);
    return month.partial
      ? t(($) => $.monitor.table.partial_month_label, {
        month: label,
        day: dayOfMonth(month.through_date),
      })
      : label;
  });
  const salesMonthColumnCount = Math.max(salesMonths.length, 1);
  const dailyColumnCount = Math.max(data?.meta.sales_dates.length ?? 0, 3);
  const columnCount = 4 + salesMonthColumnCount + 2 + dailyColumnCount + 2;
  const tableMinWidth = 1460 + (salesMonthColumnCount - 1) * 104;

  const summarySalesQuantityForMonth = (month: string) => {
    const point = data?.summary.monthly_sales.find((item) => item.month === month);
    return point?.net_sales_qty
      ?? rows.reduce((total, row) => total + salesQuantityForMonth(row, month), 0);
  };

  const downloadCurrentRows = async () => {
    if (!wsId || !data || rows.length === 0 || isExporting) return;

    setIsExporting(true);
    try {
      const blob = await api.exportWorkspaceInventoryMonitor(wsId, {
        search,
        category,
        series,
        warehouseNo,
        turnoverStatus,
      });
      downloadBlob(blob, buildInventoryMonitorCsvFileName(t(($) => $.monitor.title)));
      toast.success(t(($) => $.monitor.actions.download_success));
    } catch {
      toast.error(t(($) => $.monitor.actions.download_failed));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-card/60 px-5 py-4 backdrop-blur-sm md:px-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">{t(($) => $.monitor.title)}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.monitor.subtitle)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.meta.sales_through_date ? (
              <Badge variant="outline" className="h-7 bg-background font-normal text-muted-foreground">
                <BarChart3 className="size-3" />
                {t(($) => $.monitor.sales_through, { date: data.meta.sales_through_date })}
              </Badge>
            ) : null}
            {latestInventoryUpdatedAt ? (
              <Badge variant="outline" className="h-7 bg-background font-normal text-muted-foreground">
                <Clock3 className="size-3" />
                {t(($) => $.monitor.inventory_snapshot_time, { time: formatShanghaiTime(latestInventoryUpdatedAt) })}
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={refresh} disabled={fetchingCount > 0}>
              <RefreshCw className={cn("size-3.5", fetchingCount > 0 && "animate-spin")} />
              {t(($) => $.refresh)}
            </Button>
          </div>
        </div>
        <InventorySectionNav />
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-[1880px] space-y-4">
          {configQuery.isRefetchError && configQuery.data ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-5 shrink-0 text-warning-foreground" />
                <p className="text-sm">{t(($) => $.capabilities_refresh_failed_detail)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => configQuery.refetch()}>{t(($) => $.refresh)}</Button>
            </div>
          ) : null}

          {!configQuery.data && configQuery.isLoading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-[560px]" />
            </>
          ) : notConfigured ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/15 p-8 text-center">
              <PackageSearch className="size-8 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.monitor.not_configured)}</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t(($) => $.monitor.not_configured_detail)}</p>
            </div>
          ) : (!configQuery.data && configQuery.isError) || (!monitorAvailable && !notConfigured) ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
              <ShieldAlert className="size-8 text-destructive" />
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.monitor.unavailable)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.monitor.unavailable_detail)}</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => configQuery.refetch()}>{t(($) => $.monitor.retry)}</Button>
            </div>
          ) : monitorQuery.isLoading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-[560px]" />
            </>
          ) : monitorQuery.isError ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
              <ShieldAlert className="size-8 text-destructive" />
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.monitor.unavailable)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.monitor.unavailable_detail)}</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => monitorQuery.refetch()}>{t(($) => $.monitor.retry)}</Button>
            </div>
          ) : (
            <>
              <section className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:grid-cols-5">
                <SummaryItem label={t(($) => $.monitor.summary.products)} value={formatQuantity(data?.summary.product_count ?? 0)} note={t(($) => $.monitor.summary.filtered_scope)} />
                <SummaryItem label={t(($) => $.monitor.summary.month_sales)} value={formatQuantity(data?.summary.month_net_sales_qty ?? 0)} note={t(($) => $.monitor.units)} />
                <SummaryItem label={t(($) => $.monitor.summary.total_stock)} value={formatQuantity(data?.summary.total_stock_qty ?? 0)} note={t(($) => $.monitor.units)} />
                <SummaryItem label={t(($) => $.monitor.summary.cloud_stock)} value={formatQuantity(data?.summary.cloud_stock_qty ?? 0)} note={t(($) => $.monitor.units)} />
                <SummaryItem
                  label={t(($) => $.monitor.summary.turnover)}
                  value={data?.summary.overall_turnover_days == null ? t(($) => $.monitor.no_sales) : formatQuantity(data.summary.overall_turnover_days)}
                  note={t(($) => $.monitor.summary.warning_note, { count: data?.summary.warning_count ?? 0 })}
                  warning={(data?.summary.warning_count ?? 0) > 0}
                />
              </section>

              <BrowserFullscreenFrame
                enterLabel={t(($) => $.monitor.actions.enter_fullscreen)}
                exitLabel={t(($) => $.monitor.actions.exit_fullscreen)}
                className="h-auto overflow-visible bg-transparent data-[fullscreen=true]:overflow-hidden data-[fullscreen=true]:bg-background"
              >
                {(fullscreenControl, isFullscreen, fullscreenContainerRef) => (
              <section className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card",
                isFullscreen && "flex-1 rounded-none border-0",
              )}>
                <div className="flex flex-col gap-3 border-b p-3 xl:flex-row xl:flex-wrap xl:items-center">
                  <Input
                    aria-label={t(($) => $.monitor.filters.search_label)}
                    className="xl:w-72"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder={t(($) => $.monitor.filters.search_placeholder)}
                  />
                  <Select value={category || "all"} onValueChange={(value) => setCategory(value === "all" || value == null ? "" : value)}>
                    <SelectTrigger aria-label={t(($) => $.monitor.filters.category)} className="w-full xl:w-48">
                      <SelectValue>{category || t(($) => $.monitor.filters.all_categories)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent portalContainer={fullscreenContainerRef}>
                      <SelectItem value="all">{t(($) => $.monitor.filters.all_categories)}</SelectItem>
                      {(data?.categories ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={series || "all"} onValueChange={(value) => setSeries(value === "all" || value == null ? "" : value)}>
                    <SelectTrigger aria-label={t(($) => $.monitor.filters.series)} className="w-full xl:w-48">
                      <SelectValue>{series || t(($) => $.monitor.filters.all_series)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent portalContainer={fullscreenContainerRef}>
                      <SelectItem value="all">{t(($) => $.monitor.filters.all_series)}</SelectItem>
                      {(data?.series ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={warehouseNo || "all"} onValueChange={(value) => setWarehouseNo(value === "all" || value == null ? "" : value)}>
                    <SelectTrigger aria-label={t(($) => $.monitor.filters.warehouse)} className="w-full xl:w-52">
                      <SelectValue>{selectedWarehouse?.warehouse_name || selectedWarehouse?.warehouse_no || t(($) => $.monitor.filters.all_warehouses)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent portalContainer={fullscreenContainerRef}>
                      <SelectItem value="all">{t(($) => $.monitor.filters.all_warehouses)}</SelectItem>
                      {(data?.warehouses ?? []).map((warehouse) => (
                        <SelectItem key={warehouse.warehouse_no} value={warehouse.warehouse_no}>
                          {warehouse.warehouse_name || warehouse.warehouse_no}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={turnoverStatus} onValueChange={(value) => setTurnoverStatus((value ?? "all") as InventoryMonitorTurnoverStatus)}>
                    <SelectTrigger aria-label={t(($) => $.monitor.filters.turnover_status)} className="w-full xl:w-48">
                      <SelectValue>{turnoverStatusLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent portalContainer={fullscreenContainerRef}>
                      <SelectItem value="all">{t(($) => $.monitor.filters.all_statuses)}</SelectItem>
                      <SelectItem value="normal">{t(($) => $.monitor.status.normal)}</SelectItem>
                      <SelectItem value="warning">{t(($) => $.monitor.status.warning)}</SelectItem>
                      <SelectItem value="no_sales">{t(($) => $.monitor.status.no_sales)}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex shrink-0 items-center gap-1 xl:ml-auto">
                    <p className="mr-1 text-xs text-muted-foreground">
                      {t(($) => $.monitor.result_count, { count: data?.total ?? 0 })}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={downloadCurrentRows}
                      disabled={isExporting || monitorQuery.isFetching || rows.length === 0}
                      aria-label={isExporting
                        ? t(($) => $.monitor.actions.downloading)
                        : t(($) => $.monitor.actions.download)}
                      title={isExporting
                        ? t(($) => $.monitor.actions.downloading)
                        : t(($) => $.monitor.actions.download)}
                    >
                      {isExporting
                        ? <RefreshCw className="size-3.5 animate-spin" />
                        : <Download className="size-3.5" />}
                    </Button>
                    {fullscreenControl}
                  </div>
                </div>

                <div className={cn(
                  "max-h-[calc(100vh-19rem)] min-h-80 overflow-auto",
                  isFullscreen && "min-h-0 max-h-none flex-1",
                )}>
                  <Table className="border-separate border-spacing-0" style={{ minWidth: tableMinWidth }}>
                    <TableHeader>
                      <TableRow className="bg-muted/80 hover:bg-muted/80">
                        <TableHead rowSpan={2} className="sticky left-0 top-0 z-40 w-28 min-w-28 border-b border-r bg-muted px-3">{t(($) => $.monitor.table.category)}</TableHead>
                        <TableHead rowSpan={2} className="sticky left-28 top-0 z-40 w-28 min-w-28 border-b border-r bg-muted px-3">{t(($) => $.monitor.table.series)}</TableHead>
                        <TableHead rowSpan={2} className="sticky left-56 top-0 z-40 w-24 min-w-24 border-b border-r bg-muted px-3">{t(($) => $.monitor.table.material_code)}</TableHead>
                        <TableHead rowSpan={2} className="sticky left-80 top-0 z-40 w-80 min-w-80 border-b border-r bg-muted px-3">{t(($) => $.monitor.table.material_name)}</TableHead>
                        {salesMonths.length > 0 ? (
                          <TableHead scope="colgroup" colSpan={salesMonths.length} className="sticky top-0 z-30 border-b border-r bg-muted text-center">
                            {t(($) => $.monitor.table.monthly_sales_group)}
                          </TableHead>
                        ) : (
                          <TableHead rowSpan={2} className="sticky top-0 z-30 border-b border-r bg-muted text-right">{t(($) => $.monitor.table.month_sales)}</TableHead>
                        )}
                        <TableHead scope="colgroup" colSpan={2} className="sticky top-0 z-30 border-b border-r bg-muted text-center">{t(($) => $.monitor.table.inventory_group)}</TableHead>
                        <TableHead scope="colgroup" colSpan={dailyColumnCount} className="sticky top-0 z-30 border-b border-r bg-muted text-center">{t(($) => $.monitor.table.recent_sales_group)}</TableHead>
                        <TableHead scope="colgroup" colSpan={2} className="sticky top-0 z-30 border-b bg-muted text-center">{t(($) => $.monitor.table.turnover_group)}</TableHead>
                      </TableRow>
                      <TableRow className="bg-muted/80 hover:bg-muted/80">
                        {salesMonths.map((month, index) => (
                          <TableHead
                            key={month.month}
                            className={cn(
                              "sticky top-10 z-30 min-w-24 border-b bg-muted text-right",
                              index === salesMonths.length - 1 && "border-r",
                              month.partial && "bg-primary/10 text-primary",
                            )}
                          >
                            {salesMonthLabels[index]}
                          </TableHead>
                        ))}
                        <TableHead className="sticky top-10 z-30 border-b bg-muted text-right">{t(($) => $.monitor.table.total_stock)}</TableHead>
                        <TableHead className="sticky top-10 z-30 border-b border-r bg-muted text-right">{t(($) => $.monitor.table.cloud_stock)}</TableHead>
                        {(data?.meta.sales_dates.length ? data.meta.sales_dates : ["", "", ""]).map((date, index) => (
                          <TableHead key={date || index} className="sticky top-10 z-30 border-b bg-muted text-right">{formatDateLabel(date, locale)}</TableHead>
                        ))}
                        <TableHead className="sticky top-10 z-30 border-b border-r bg-muted text-right">{t(($) => $.monitor.table.daily_average)}</TableHead>
                        <TableHead className="sticky top-10 z-30 border-b bg-muted text-right">{t(($) => $.monitor.table.turnover_days)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, index) => (
                        <TableRow key={row.material_code} className="hover:bg-muted/30">
                          {groupSpans.category.has(index) ? (
                            <TableCell rowSpan={groupSpans.category.get(index)} className="sticky left-0 z-20 border-r bg-card px-3 align-middle font-medium whitespace-normal">{row.category_name || "—"}</TableCell>
                          ) : null}
                          {groupSpans.series.has(index) ? (
                            <TableCell rowSpan={groupSpans.series.get(index)} className="sticky left-28 z-20 border-r bg-card px-3 align-middle whitespace-normal">{row.series_name || "—"}</TableCell>
                          ) : null}
                          <TableCell className="sticky left-56 z-10 border-r bg-card px-3 font-mono text-xs tabular-nums">{row.material_code}</TableCell>
                          <TableCell className="sticky left-80 z-10 border-r bg-card px-3 whitespace-normal">
                            <p className="max-w-80 leading-5">{row.material_name}</p>
                            {row.product_no ? <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.product_no}</p> : null}
                          </TableCell>
                          {salesMonths.length > 0 ? salesMonths.map((month, monthIndex) => (
                            <TableCell
                              key={month.month}
                              className={cn(
                                "text-right font-mono tabular-nums",
                                monthIndex === salesMonths.length - 1 && "border-r",
                              )}
                            >
                              {formatQuantity(salesQuantityForMonth(row, month.month))}
                            </TableCell>
                          )) : (
                            <TableCell className="border-r text-right font-mono tabular-nums">{formatQuantity(row.month_net_sales_qty)}</TableCell>
                          )}
                          <TableCell className="text-right font-mono tabular-nums">{formatQuantity(row.total_stock_qty)}</TableCell>
                          <TableCell className="border-r text-right font-mono tabular-nums">{formatQuantity(row.cloud_stock_qty)}</TableCell>
                          {Array.from({ length: dailyColumnCount }, (_, dayIndex) => {
                            const point = row.daily_sales[dayIndex];
                            return <TableCell key={point?.date ?? dayIndex} className="text-right font-mono tabular-nums">{formatQuantity(point?.net_sales_qty ?? 0)}</TableCell>;
                          })}
                          <TableCell className="border-r text-right font-mono tabular-nums">{formatQuantity(row.average_daily_sales_3d)}</TableCell>
                          <TableCell className={cn(
                            "text-right font-mono font-medium tabular-nums",
                            row.turnover_status === "warning" && "bg-destructive/12 text-destructive",
                            row.turnover_status === "no_sales" && "font-sans text-xs text-muted-foreground",
                          )}>
                            {row.turnover_days == null ? t(($) => $.monitor.no_sales) : formatQuantity(row.turnover_days)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={columnCount} className="h-48 text-center">
                            <Boxes className="mx-auto size-6 text-muted-foreground" />
                            <p className="mt-2 text-sm font-medium">{t(($) => $.monitor.empty)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.monitor.empty_detail)}</p>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                    {rows.length > 0 ? (
                      <TableFooter className="sticky bottom-0 z-30 bg-muted/95 backdrop-blur-sm">
                        <TableRow>
                          <TableCell colSpan={4} className="sticky left-0 z-40 border-r bg-muted px-3 font-semibold">{t(($) => $.monitor.subtotal)}</TableCell>
                          {salesMonths.length > 0 ? salesMonths.map((month, monthIndex) => (
                            <TableCell
                              key={month.month}
                              className={cn(
                                "text-right font-mono font-semibold tabular-nums",
                                monthIndex === salesMonths.length - 1 && "border-r",
                              )}
                            >
                              {formatQuantity(summarySalesQuantityForMonth(month.month))}
                            </TableCell>
                          )) : (
                            <TableCell className="border-r text-right font-mono font-semibold tabular-nums">{formatQuantity(data?.summary.month_net_sales_qty ?? 0)}</TableCell>
                          )}
                          <TableCell className="text-right font-mono font-semibold tabular-nums">{formatQuantity(data?.summary.total_stock_qty ?? 0)}</TableCell>
                          <TableCell className="border-r text-right font-mono font-semibold tabular-nums">{formatQuantity(data?.summary.cloud_stock_qty ?? 0)}</TableCell>
                          {Array.from({ length: dailyColumnCount }, (_, index) => (
                            <TableCell key={data?.meta.sales_dates[index] ?? index} className="text-right font-mono font-semibold tabular-nums">
                              {formatQuantity(rows.reduce((sum, row) => sum + (row.daily_sales[index]?.net_sales_qty ?? 0), 0))}
                            </TableCell>
                          ))}
                          <TableCell className="border-r text-right font-mono font-semibold tabular-nums">{formatQuantity(data?.summary.average_daily_sales_3d ?? 0)}</TableCell>
                          <TableCell className={cn("text-right font-mono font-semibold tabular-nums", (data?.summary.warning_count ?? 0) > 0 && "text-destructive")}>
                            {data?.summary.overall_turnover_days == null ? t(($) => $.monitor.no_sales) : formatQuantity(data.summary.overall_turnover_days)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    ) : null}
                  </Table>
                </div>
              </section>
                )}
              </BrowserFullscreenFrame>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
