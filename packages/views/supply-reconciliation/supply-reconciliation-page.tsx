"use client";

import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CircleDollarSign, Database, Gauge, PackageSearch, ShieldAlert } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useWorkspacePaths } from "@teamify/core/paths";
import {
  supplyFeeKeys,
  useSupplyFeeFilterStore,
  workspaceSupplyFeeConfigOptions,
  workspaceSupplyFeeDashboardOptions,
  type SupplyFeeBreakdown,
} from "@teamify/core/supply-reconciliation";
import { Button } from "@teamify/ui/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@teamify/ui/components/ui/chart";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import { SupplyFeeFilterBar } from "./components/supply-fee-filter-bar";
import { SupplyFeePageHeader } from "./components/supply-fee-page-header";
import { SupplyFeeResultsTable } from "./components/supply-fee-results-table";

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const compactFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function formatMoney(value: number, currency = "CNY", compact = false) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    }).format(value);
  } catch {
    return numberFormatter.format(value);
  }
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  risk = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Gauge;
  risk?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm", risk && "border-warning/40")}>
      <div className={cn("absolute inset-y-0 left-0 w-1 bg-primary", risk && "bg-warning")} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className={cn("mt-2 font-mono text-2xl font-semibold tracking-tight", risk && "text-warning-foreground")}>{value}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{note}</p>
        </div>
        <div className={cn("rounded-md border bg-muted/30 p-2 text-muted-foreground", risk && "border-warning/20 bg-warning/10 text-warning-foreground")}>
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function BreakdownList({
  rows,
  currency,
  empty,
  labelFor,
}: {
  rows: SupplyFeeBreakdown[];
  currency: string;
  empty: string;
  labelFor?: (row: SupplyFeeBreakdown) => string;
}) {
  const max = Math.max(...rows.map((row) => row.absolute_diff_amount), 0);
  if (rows.length === 0) return <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">{empty}</div>;
  return (
    <div className="space-y-3">
      {rows.slice(0, 6).map((row, index) => (
        <div key={`${row.key}-${index}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium">{labelFor?.(row) ?? row.label ?? row.key}</span>
            <span className="shrink-0 font-mono font-semibold">{formatMoney(row.absolute_diff_amount, currency, true)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${max > 0 ? Math.max(3, (row.absolute_diff_amount / max) * 100) : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SupplyReconciliationPage() {
  const { t } = useT("supply-reconciliation");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: supplyFeeKeys.all(wsId) });
  const filters = useSupplyFeeFilterStore((state) => state.filters);
  const patchFilters = useSupplyFeeFilterStore((state) => state.patchFilters);
  const clearFilters = useSupplyFeeFilterStore((state) => state.clearFilters);
  const configQuery = useQuery(workspaceSupplyFeeConfigOptions(wsId));
  const config = configQuery.data;
  const dashboardQuery = useQuery(workspaceSupplyFeeDashboardOptions(wsId, filters, config?.available === true));
  const data = dashboardQuery.data;
  const metrics = data?.metrics;
  const currency = config?.default_currency || "CNY";
  const feeLabel = (value: string) => value === "freight"
    ? t(($) => $.fee_types.freight)
    : value === "outbound_handling"
      ? t(($) => $.fee_types.outbound_handling)
      : value === "storage"
        ? t(($) => $.fee_types.storage)
        : value;
  const oneSided = (metrics?.only_bill_count ?? 0) + (metrics?.only_expected_count ?? 0);
  const chartConfig = {
    billed_amount: { label: t(($) => $.charts.billed), color: "var(--color-chart-2)" },
    expected_amount: { label: t(($) => $.charts.expected), color: "var(--color-chart-1)" },
  } satisfies ChartConfig;

  const refresh = () => queryClient.invalidateQueries({ queryKey: supplyFeeKeys.all(wsId) });
  const latestRunNo = data?.latest_run_no || config?.latest_run_no || "";
  const latestRunAt = data?.latest_run_at || config?.latest_run_at || "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SupplyFeePageHeader latestRunNo={latestRunNo} latestRunAt={latestRunAt} refreshing={fetching > 0} onRefresh={refresh} />
      <main className="min-h-0 flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-[1680px] space-y-5">
          <SupplyFeeFilterBar config={config} filters={filters} onPatch={patchFilters} onClear={clearFilters} />

          {configQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div>
          ) : configQuery.isError || !config?.available ? (
            <section className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 text-center">
              <div className="rounded-full border bg-muted/30 p-3 text-muted-foreground"><Database className="size-5" /></div>
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.not_configured)}</h2>
              <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{t(($) => $.not_configured_detail)}</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => configQuery.refetch()}>{t(($) => $.refresh)}</Button>
            </section>
          ) : !config.latest_run_no ? (
            <section className="relative flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-card px-6 text-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-muted)_1px,transparent_1px)] bg-[size:18px_18px] opacity-40" />
              <div className="relative rounded-xl border bg-background p-3 text-primary shadow-sm"><PackageSearch className="size-6" /></div>
              <h2 className="relative mt-4 text-base font-semibold">{t(($) => $.no_successful_run)}</h2>
              <p className="relative mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{t(($) => $.no_successful_run_detail)}</p>
            </section>
          ) : dashboardQuery.isLoading ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div>
              <Skeleton className="h-80" />
            </div>
          ) : dashboardQuery.isError ? (
            <section className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-3"><ShieldAlert className="size-5 shrink-0 text-destructive" /><div><h2 className="text-sm font-semibold">{t(($) => $.query_failed)}</h2><p className="mt-0.5 text-xs text-muted-foreground">{t(($) => $.query_failed_detail)}</p></div></div>
              <Button size="sm" variant="outline" onClick={() => dashboardQuery.refetch()}>{t(($) => $.refresh)}</Button>
            </section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard label={t(($) => $.metrics.absolute_variance)} value={formatMoney(metrics?.absolute_diff_amount ?? 0, currency, true)} note={t(($) => $.metrics.absolute_variance_note)} icon={CircleDollarSign} risk={(metrics?.absolute_diff_amount ?? 0) > 0} />
                <MetricCard label={t(($) => $.metrics.match_rate)} value={new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(metrics?.matched_rate ?? 0)} note={t(($) => $.metrics.match_rate_note, { matched: metrics?.matched_count ?? 0, total: metrics?.result_count ?? 0 })} icon={Gauge} />
                <MetricCard label={t(($) => $.metrics.billed)} value={formatMoney(metrics?.billed_amount ?? 0, currency, true)} note={t(($) => $.metrics.expected) + ` ${formatMoney(metrics?.expected_amount ?? 0, currency, true)}`} icon={CircleDollarSign} />
                <MetricCard label={t(($) => $.metrics.exception_lines)} value={compactFormatter.format((metrics?.result_count ?? 0) - (metrics?.matched_count ?? 0))} note={t(($) => $.metrics.exception_lines_note, { diff: metrics?.diff_count ?? 0, oneSided })} icon={AlertTriangle} risk={(metrics?.diff_count ?? 0) > 0} />
                <MetricCard label={t(($) => $.metrics.sku_coverage)} value={compactFormatter.format(metrics?.sku_count ?? 0)} note={t(($) => $.metrics.sku_coverage_note)} icon={Boxes} />
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div><h2 className="text-sm font-semibold">{t(($) => $.charts.trend)}</h2><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.charts.trend_note)}</p></div>
                  {(data?.trend.length ?? 0) === 0 ? <div className="flex h-72 items-center justify-center text-xs text-muted-foreground">{t(($) => $.charts.empty)}</div> : (
                    <ChartContainer config={chartConfig} className="mt-4 h-72 w-full aspect-auto" initialDimension={{ width: 960, height: 288 }}>
                      <AreaChart data={data?.trend ?? []} margin={{ left: 4, right: 8, top: 8 }}>
                        <defs>
                          <linearGradient id="supplyBilled" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-billed_amount)" stopOpacity={0.28} /><stop offset="95%" stopColor="var(--color-billed_amount)" stopOpacity={0} /></linearGradient>
                          <linearGradient id="supplyExpected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-expected_amount)" stopOpacity={0.18} /><stop offset="95%" stopColor="var(--color-expected_amount)" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickMargin={8} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => compactFormatter.format(Number(value))} width={48} />
                        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                        <Area dataKey="expected_amount" type="monotone" stroke="var(--color-expected_amount)" fill="url(#supplyExpected)" strokeWidth={2} />
                        <Area dataKey="billed_amount" type="monotone" stroke="var(--color-billed_amount)" fill="url(#supplyBilled)" strokeWidth={2} />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <h2 className="text-sm font-semibold">{t(($) => $.charts.fee_mix)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{t(($) => $.charts.fee_mix_note)}</p>
                  <div className="mt-5"><BreakdownList rows={data?.fee_breakdown ?? []} currency={currency} empty={t(($) => $.charts.empty)} labelFor={(row) => feeLabel(row.key)} /></div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border bg-card p-4 shadow-sm"><h2 className="text-sm font-semibold">{t(($) => $.charts.providers)}</h2><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.charts.providers_note)}</p><div className="mt-5"><BreakdownList rows={data?.provider_ranking ?? []} currency={currency} empty={t(($) => $.charts.empty)} /></div></div>
                <div className="rounded-lg border bg-card p-4 shadow-sm"><h2 className="text-sm font-semibold">{t(($) => $.charts.warehouses)}</h2><div className="mt-5"><BreakdownList rows={data?.warehouse_ranking ?? []} currency={currency} empty={t(($) => $.charts.empty)} /></div></div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <h2 className="text-sm font-semibold">{t(($) => $.charts.reasons)}</h2>
                  <div className="mt-5 space-y-3">{(data?.reason_breakdown.length ?? 0) === 0 ? <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">{t(($) => $.charts.empty)}</div> : data?.reason_breakdown.slice(0, 6).map((row) => <div key={row.reason_code} className="flex items-center justify-between gap-3 border-b pb-2 text-xs last:border-0"><span className="truncate font-mono text-muted-foreground">{row.reason_code}</span><div className="text-right"><p className="font-mono font-semibold">{formatMoney(row.absolute_diff_amount, currency, true)}</p><p className="text-[10px] text-muted-foreground">{t(($) => $.charts.lines, { count: row.result_count })}</p></div></div>)}</div>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b p-4">
                  <div><h2 className="text-sm font-semibold">{t(($) => $.exceptions.title)}</h2><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.exceptions.subtitle)}</p></div>
                  <Button size="sm" variant="outline" onClick={() => navigation.push(paths.supplyReconciliationResults())}>{t(($) => $.exceptions.view_all)}</Button>
                </div>
                {(data?.top_exceptions.length ?? 0) === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center"><AlertTriangle className="size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t(($) => $.exceptions.empty)}</p><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.exceptions.empty_detail)}</p></div>
                ) : <SupplyFeeResultsTable compact rows={data?.top_exceptions ?? []} currency={currency} onOpen={(resultId) => navigation.push(paths.supplyReconciliationResult(resultId))} />}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
