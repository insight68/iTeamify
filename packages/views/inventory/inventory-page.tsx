"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Boxes, CircleDollarSign, Clock3, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react";
import { useWorkspaceId } from "@teamify/core/hooks";
import { workspaceInventoryDashboardOptions } from "@teamify/core/inventory";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import { Input } from "@teamify/ui/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@teamify/ui/components/ui/select";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@teamify/ui/components/ui/table";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../i18n";
import { SalesTrendPanel, type SalesTrendSelection } from "./components/sales-trend-panel";

const text = (row: Record<string, unknown>, key: string) => typeof row[key] === "string" ? row[key] as string : "—";
const number = (row: Record<string, unknown>, key: string) => typeof row[key] === "number" ? row[key] as number : Number(row[key] ?? 0) || 0;
const formatNumber = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
const formatMoney = (value: number, currency = "CNY") => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
  catch { return formatNumber(value); }
};

function RiskBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    critical: "border-destructive/30 bg-destructive/10 text-destructive",
    high: "border-warning/30 bg-warning/10 text-warning-foreground",
    medium: "border-info/30 bg-info/10 text-info",
    low: "border-border bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={cn("font-mono uppercase tracking-wide", styles[value] ?? styles.low)}>{value || "unknown"}</Badge>;
}

function MetricCard({ label, value, note, icon: Icon, urgent }: { label: string; value: string; note?: string; icon: typeof Boxes; urgent?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-card p-4", urgent && "border-destructive/30")}>
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</p>{note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}</div>
        <div className={cn("rounded-md border bg-muted/40 p-2 text-muted-foreground", urgent && "text-destructive")}><Icon className="size-4" /></div>
      </div>
    </div>
  );
}

export function InventoryPage() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { t } = useT("inventory");
  const [page, setPage] = useState(1);
  const [skuInput, setSkuInput] = useState("");
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("all");
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(30);
  const [selectedRecommendation, setSelectedRecommendation] = useState<(SalesTrendSelection & { id: string }) | null>(null);
  const filters = useMemo(() => ({
    ...(skuInput.trim() ? { sku_code: skuInput.trim() } : {}),
    ...(risk !== "all" ? { risk_level: risk } : {}),
    ...(status !== "all" ? { status } : {}),
  }), [skuInput, risk, status]);
  const query = useQuery(workspaceInventoryDashboardOptions(wsId, { filters, page, pageSize: 30 }));
  const data = query.data;
  const metrics = data?.metrics;
  const batch = data?.batch;
  const rows = data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 30));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-card/60 px-5 py-4 backdrop-blur-sm md:px-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2"><Boxes className="size-5 text-primary" /><h1 className="text-xl font-semibold tracking-tight">{t(($) => $.title)}</h1></div>
            <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.subtitle)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {batch?.delayed && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive"><AlertTriangle className="mr-1 size-3" />{t(($) => $.delayed)}</Badge>}
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /><span>{batch?.snapshot_at ? t(($) => $.updated_at, { time: new Date(batch.snapshot_at).toLocaleString() }) : t(($) => $.hourly)}</span></div>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["inventory", wsId] })} disabled={query.isFetching}><RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />{t(($) => $.refresh)}</Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-[1680px] space-y-5">
          {query.isLoading ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28" />)}
            </section>
          ) : query.isError ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-3"><ShieldAlert className="size-5 shrink-0 text-destructive" /><div><p className="text-sm font-medium">{t(($) => $.unavailable)}</p><p className="mt-0.5 text-xs text-muted-foreground">{t(($) => $.dashboard_unavailable_detail)}</p></div></div>
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>{t(($) => $.refresh)}</Button>
            </div>
          ) : (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label={t(($) => $.metrics.opportunities)} value={formatNumber(metrics?.total_recommendations ?? 0)} icon={Boxes} />
              <MetricCard label={t(($) => $.metrics.critical)} value={formatNumber(metrics?.critical_count ?? 0)} icon={ShieldAlert} urgent={(metrics?.critical_count ?? 0) > 0} />
              <MetricCard label={t(($) => $.metrics.pending)} value={formatNumber(metrics?.pending_count ?? 0)} icon={Clock3} />
              <MetricCard label={t(($) => $.metrics.saved_sales)} value={formatNumber(metrics?.estimated_saved_sales_qty ?? 0)} icon={TrendingUp} />
              <MetricCard label={t(($) => $.metrics.benefit)} value={formatMoney(metrics?.estimated_benefit_amount ?? 0)} icon={CircleDollarSign} />
            </section>
          )}

          <SalesTrendPanel
            wsId={wsId}
            days={trendDays}
            onDaysChange={setTrendDays}
            selection={selectedRecommendation}
            onClearSelection={() => setSelectedRecommendation(null)}
          />

          {query.isLoading ? <Skeleton className="h-96" /> : query.isError ? null : (
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
                <Input className="md:w-64" value={skuInput} onChange={(event) => { setSkuInput(event.target.value); setPage(1); }} placeholder={t(($) => $.search_sku)} />
                <Select value={risk} onValueChange={(value) => { setRisk(value ?? "all"); setPage(1); }}><SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t(($) => $.all_risks)}</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
                <Select value={status} onValueChange={(value) => { setStatus(value ?? "all"); setPage(1); }}><SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t(($) => $.all_statuses)}</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="pending_approval">Pending approval</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
                <div className="ml-auto font-mono text-xs text-muted-foreground">{batch?.batch_no || "—"}</div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/30"><TableHead>{t(($) => $.table.sku)}</TableHead><TableHead>{t(($) => $.table.route)}</TableHead><TableHead>{t(($) => $.table.risk)}</TableHead><TableHead className="text-right">{t(($) => $.table.stock)}</TableHead><TableHead className="text-right">{t(($) => $.table.cover)}</TableHead><TableHead className="text-right">{t(($) => $.table.quantity)}</TableHead><TableHead className="text-right">{t(($) => $.table.benefit)}</TableHead><TableHead>{t(($) => $.table.status)}</TableHead><TableHead className="min-w-64">{t(($) => $.table.reason)}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.map((row, index) => {
                      const recommendationId = text(row, "id") !== "—" ? text(row, "id") : String(index);
                      const selection: SalesTrendSelection & { id: string } = {
                        id: recommendationId,
                        productCode: text(row, "sku_code") === "—" ? "" : text(row, "sku_code"),
                        productName: text(row, "sku_name") === "—" ? text(row, "sku_code") : text(row, "sku_name"),
                        warehouses: [
                          { code: text(row, "source_warehouse_code"), name: text(row, "source_warehouse_name") },
                          { code: text(row, "destination_warehouse_code"), name: text(row, "destination_warehouse_name") },
                        ].filter((warehouse) => warehouse.code !== "—"),
                      };
                      return <TableRow
                        key={recommendationId}
                        role="button"
                        tabIndex={0}
                        aria-selected={selectedRecommendation?.id === recommendationId}
                        className={cn("cursor-pointer", selectedRecommendation?.id === recommendationId && "bg-primary/5")}
                        onClick={() => setSelectedRecommendation((current) => current?.id === recommendationId ? null : selection)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedRecommendation((current) => current?.id === recommendationId ? null : selection);
                          }
                        }}
                      >
                      <TableCell><div className="font-medium">{text(row, "sku_name")}</div><div className="font-mono text-xs text-muted-foreground">{text(row, "sku_code")}</div></TableCell>
                      <TableCell><div className="flex min-w-56 items-center gap-2 text-sm"><span>{text(row, "source_warehouse_name")}</span><ArrowRight className="size-3.5 shrink-0 text-primary" /><span>{text(row, "destination_warehouse_name")}</span></div></TableCell>
                      <TableCell><RiskBadge value={text(row, "risk_level") === "—" ? "unknown" : text(row, "risk_level")} /></TableCell>
                      <TableCell className="text-right font-mono"><div>{formatNumber(number(row, "source_available_qty"))}</div><div className="text-xs text-muted-foreground">→ {formatNumber(number(row, "destination_available_qty"))}</div></TableCell>
                      <TableCell className="text-right font-mono"><div>{formatNumber(number(row, "source_cover_before"))} → {formatNumber(number(row, "source_cover_after"))}</div><div className="text-xs text-muted-foreground">{formatNumber(number(row, "destination_cover_before"))} → {formatNumber(number(row, "destination_cover_after"))}</div></TableCell>
                      <TableCell className="text-right font-mono"><span>{formatNumber(number(row, "suggested_qty"))}</span><span className="mx-1 text-muted-foreground">/</span><strong>{formatNumber(number(row, "final_qty"))}</strong></TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(number(row, "estimated_benefit_amount"), text(row, "currency_code") === "—" ? "CNY" : text(row, "currency_code"))}</TableCell>
                      <TableCell><Badge variant="secondary">{text(row, "status")}</Badge></TableCell>
                      <TableCell><p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{text(row, "reason_text")}</p></TableCell>
                    </TableRow>;})}
                    {rows.length === 0 && <TableRow><TableCell colSpan={9} className="h-40 text-center text-muted-foreground">{t(($) => $.empty)}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">{t(($) => $.page, { page, total: data?.total ?? 0 })}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t(($) => $.previous)}</Button><Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>{t(($) => $.next)}</Button></div></div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
