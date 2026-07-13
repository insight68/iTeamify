"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, RotateCcw, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { workspaceInventorySalesTrendOptions } from "@teamify/core/inventory";
import { Button } from "@teamify/ui/components/ui/button";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@teamify/ui/components/ui/chart";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../../i18n";

export interface SalesTrendSelection {
  productCode: string;
  productName: string;
  warehouses: Array<{ code: string; name: string }>;
}

type TrendPoint = {
  stat_date: string;
  series_key: string;
  series_name: string;
  sales_qty: number;
  refund_qty: number;
  net_sales_qty: number;
  sales_count: number;
  moving_average_7d: number;
  partial: boolean;
};

type ChartRow = Record<string, string | number | boolean> & { stat_date: string; partial: boolean };

const compact = (value: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const percent = (value?: number | null) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value);

function TrendTooltip({ active, payload, label, seriesKeys, labels }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartRow }>;
  label?: string | number;
  seriesKeys: string[];
  labels: { partial: string; sales: string; refund: string; orders: string };
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="min-w-56 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
      <div className="mb-2 flex items-center justify-between gap-4"><span className="font-mono text-xs font-medium">{String(label)}</span>{row.partial && <span className="text-[10px] text-warning-foreground">{labels.partial}</span>}</div>
      <div className="space-y-2">
        {seriesKeys.map((key, index) => <div key={key} className="grid grid-cols-[8px_1fr_auto] items-center gap-2 text-xs">
          <span className={cn("size-2 rounded-full", index === 0 ? "bg-chart-1" : "bg-chart-2")} />
          <span className="truncate text-muted-foreground">{String(row[`${key}_name`] ?? key)}</span>
          <span className="font-mono font-medium">{compact(Number(row[`${key}_net`] ?? 0))}</span>
          <span />
          <span className="text-[10px] text-muted-foreground">{labels.sales} {compact(Number(row[`${key}_sales`] ?? 0))} · {labels.refund} {compact(Number(row[`${key}_refund`] ?? 0))}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{compact(Number(row[`${key}_orders`] ?? 0))} {labels.orders}</span>
        </div>)}
      </div>
    </div>
  );
}

export function SalesTrendPanel({
  wsId,
  days,
  onDaysChange,
  selection,
  onClearSelection,
}: {
  wsId: string;
  days: 7 | 30 | 90;
  onDaysChange: (days: 7 | 30 | 90) => void;
  selection: SalesTrendSelection | null;
  onClearSelection: () => void;
}) {
  const { t } = useT("inventory");
  const warehouseCodes = selection?.warehouses.map((warehouse) => warehouse.code) ?? [];
  const query = useQuery(workspaceInventorySalesTrendOptions(wsId, {
    days,
    productCode: selection?.productCode,
    warehouseCodes,
  }));
  const points = (query.data?.points ?? []) as TrendPoint[];
  const seriesKeys = useMemo(() => Array.from(new Set(points.map((point) => point.series_key))), [points]);
  const chartData = useMemo(() => {
    const byDate = new Map<string, ChartRow>();
    for (const point of points) {
      const row = byDate.get(point.stat_date) ?? { stat_date: point.stat_date, partial: point.partial };
      row[`${point.series_key}_name`] = point.series_key === "all" ? t(($) => $.sales_trend.net_sales) : point.series_name;
      row[`${point.series_key}_net`] = point.net_sales_qty;
      row[`${point.series_key}_avg`] = point.moving_average_7d;
      row[`${point.series_key}_sales`] = point.sales_qty;
      row[`${point.series_key}_refund`] = point.refund_qty;
      row[`${point.series_key}_orders`] = point.sales_count;
      row.partial = row.partial || point.partial;
      byDate.set(point.stat_date, row);
    }
    return Array.from(byDate.values());
  }, [points, t]);
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    seriesKeys.forEach((key, index) => {
      config[`${key}_net`] = { label: key, color: `var(--color-chart-${index + 1})` };
    });
    if (seriesKeys.length === 1) config[`${seriesKeys[0]}_avg`] = { label: "7d", color: "var(--color-muted-foreground)" };
    return config;
  }, [seriesKeys]);
  const summary = query.data?.summary;
  const change = summary?.previous_change_rate;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-primary" /><h2 className="text-sm font-semibold">{t(($) => $.sales_trend.title)}</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">{selection ? t(($) => $.sales_trend.comparison_subtitle, { product: selection.productName || selection.productCode }) : t(($) => $.sales_trend.overall_subtitle)}</p>
          {!selection && <p className="mt-1 text-[11px] text-muted-foreground/80">{t(($) => $.sales_trend.select_hint)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selection && <Button size="sm" variant="ghost" onClick={onClearSelection}><RotateCcw className="size-3.5" />{t(($) => $.sales_trend.clear_comparison)}</Button>}
          <div className="flex rounded-md border bg-muted/30 p-0.5">{([7, 30, 90] as const).map((value) => <button key={value} type="button" onClick={() => onDaysChange(value)} className={cn("rounded px-3 py-1.5 font-mono text-xs transition-colors", days === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{value}D</button>)}</div>
        </div>
      </div>

      {query.isLoading ? <div className="space-y-4 p-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16" />)}</div><Skeleton className="h-72" /></div> : query.isError ? <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">{t(($) => $.sales_trend.unavailable)}</div> : (
        <>
          <div className="grid grid-cols-2 border-b lg:grid-cols-4">
            <SummaryCell label={t(($) => $.sales_trend.period_total)} value={`${compact(summary?.net_sales_qty ?? 0)} ${t(($) => $.sales_trend.pieces)}`} />
            <SummaryCell label={t(($) => $.sales_trend.daily_average)} value={compact(summary?.average_daily_qty ?? 0)} />
            <SummaryCell label={t(($) => $.sales_trend.period_change)} value={percent(change)} trend={change} />
            <SummaryCell label={t(($) => $.sales_trend.refund_rate)} value={percent(summary?.refund_rate)} />
          </div>
          {query.data?.latest_partial && <div className="border-b bg-warning/5 px-4 py-2 text-xs text-warning-foreground">{t(($) => $.sales_trend.partial)}</div>}
          {chartData.length === 0 ? <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">{t(($) => $.sales_trend.no_data)}</div> : <div className="p-3 md:p-5">
            <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto" initialDimension={{ width: 960, height: 288 }}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="stat_date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} tickFormatter={(value: string) => value.slice(5)} />
                <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={(value: number) => compact(value)} />
                <ChartTooltip content={(props) => <TrendTooltip active={props.active} payload={props.payload as unknown as ReadonlyArray<{ payload?: ChartRow }>} label={props.label} seriesKeys={seriesKeys} labels={{ partial: t(($) => $.sales_trend.partial), sales: t(($) => $.sales_trend.tooltip_sales), refund: t(($) => $.sales_trend.tooltip_refund), orders: t(($) => $.sales_trend.tooltip_orders) }} />} />
                {seriesKeys.map((key) => <Line key={key} type="monotone" dataKey={`${key}_net`} name={String(chartData[0]?.[`${key}_name`] ?? key)} stroke={`var(--color-${key}_net)`} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls />)}
                {seriesKeys.length === 1 && <Line type="monotone" dataKey={`${seriesKeys[0]}_avg`} name={t(($) => $.sales_trend.moving_average)} stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} connectNulls />}
              </LineChart>
            </ChartContainer>
            {selection && <div className="mt-3 flex flex-wrap gap-4 px-2">{seriesKeys.map((key, index) => <div key={key} className="flex items-center gap-2 text-xs"><span className={cn("size-2.5 rounded-full", index === 0 ? "bg-chart-1" : "bg-chart-2")} /><span className="text-muted-foreground">{String(chartData[0]?.[`${key}_name`] ?? key)}</span><strong className="font-mono">{compact(query.data?.series_summary?.[key]?.net_sales_qty ?? 0)}</strong></div>)}</div>}
          </div>}
        </>
      )}
    </section>
  );
}

function SummaryCell({ label, value, trend }: { label: string; value: string; trend?: number | null }) {
  return <div className="border-r p-4 last:border-r-0"><p className="text-[11px] text-muted-foreground">{label}</p><div className="mt-1 flex items-center gap-1.5"><span className="font-mono text-lg font-semibold">{value}</span>{trend != null && trend !== 0 && (trend > 0 ? <ArrowUpRight className="size-3.5 text-success" /> : <ArrowDownRight className="size-3.5 text-destructive" />)}</div></div>;
}
