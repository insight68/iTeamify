"use client";

import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calculator, DatabaseZap, FileJson2, Link2, PackageSearch, Scale, ShieldAlert } from "lucide-react";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useWorkspacePaths } from "@teamify/core/paths";
import {
  supplyFeeKeys,
  workspaceSupplyFeeConfigOptions,
  workspaceSupplyFeeResultOptions,
  type SupplyFeeResultRow,
} from "@teamify/core/supply-reconciliation";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@teamify/ui/components/ui/table";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import { SupplyFeePageHeader } from "./components/supply-fee-page-header";
import { SupplyFeeStatusBadge } from "./components/supply-fee-status-badge";

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return numberFormatter.format(value);
  }
}

function SummaryAmount({ label, value, currency, emphasis }: { label: string; value: number; currency: string; emphasis?: boolean }) {
  return (
    <div className={cn("border-r px-4 py-3 last:border-r-0", emphasis && "bg-warning/5")}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 font-mono text-xl font-semibold", emphasis && "text-warning-foreground")}>{formatMoney(value, currency)}</p>
    </div>
  );
}

function JsonEvidence({ value }: { value: Record<string, unknown> }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md border bg-muted/20 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function WeightCell({ row }: { row: SupplyFeeResultRow }) {
  const { t } = useT("supply-reconciliation");
  const values = [
    row.actual_weight_kg == null ? null : t(($) => $.detail.actual_weight, { value: numberFormatter.format(row.actual_weight_kg) }),
    row.volume_weight_kg == null ? null : t(($) => $.detail.volume_weight, { value: numberFormatter.format(row.volume_weight_kg) }),
    row.chargeable_weight_kg == null ? null : t(($) => $.detail.chargeable_weight, { value: numberFormatter.format(row.chargeable_weight_kg) }),
  ].filter(Boolean);
  return <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">{values.length > 0 ? values.map((value) => <p key={value}>{value}</p>) : "—"}</div>;
}

export function SupplyReconciliationDetailPage({ resultId }: { resultId: string }) {
  const { t } = useT("supply-reconciliation");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: supplyFeeKeys.all(wsId) });
  const configQuery = useQuery(workspaceSupplyFeeConfigOptions(wsId));
  const detailQuery = useQuery(workspaceSupplyFeeResultOptions(wsId, resultId));
  const config = configQuery.data;
  const detail = detailQuery.data;
  const result = detail?.result;
  const lines = detail?.lines ?? [];
  const evidenceRows = detail?.evidence ?? [];
  const currency = config?.default_currency || "CNY";
  const refresh = () => queryClient.invalidateQueries({ queryKey: supplyFeeKeys.detail(wsId, resultId) });
  const feeLabel = (value: string) => value === "freight"
    ? t(($) => $.fee_types.freight)
    : value === "outbound_handling"
      ? t(($) => $.fee_types.outbound_handling)
      : value === "storage"
        ? t(($) => $.fee_types.storage)
        : value;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SupplyFeePageHeader latestRunNo={result?.run_no || config?.latest_run_no} latestRunAt={config?.latest_run_at} refreshing={fetching > 0} onRefresh={refresh} />
      <main className="min-h-0 flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-[1580px] space-y-5">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon-sm" aria-label={t(($) => $.actions.back)} onClick={() => navigation.push(paths.supplyReconciliationResults())}><ArrowLeft className="size-4" /></Button>
            <div><h2 className="text-lg font-semibold tracking-tight">{t(($) => $.detail.title)}</h2><p className="mt-1 font-mono text-xs text-muted-foreground">{t(($) => $.detail.subtitle, { id: resultId, run: result?.run_no || "—" })}</p></div>
          </div>

          {detailQuery.isLoading || configQuery.isLoading ? (
            <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-72" /><Skeleton className="h-64" /></div>
          ) : detailQuery.isError || !result?.id ? (
            <section className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 text-center">
              <ShieldAlert className="size-6 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.detail.not_found)}</h2>
              <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{t(($) => $.detail.not_found_detail)}</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => navigation.push(paths.supplyReconciliationResults())}>{t(($) => $.actions.back)}</Button>
            </section>
          ) : (
            <>
              <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
                <div className="flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center">
                  <div className="flex flex-wrap items-center gap-2"><SupplyFeeStatusBadge status={result.result_status} /><Badge variant="outline">{feeLabel(result.fee_type)}</Badge><span className="font-mono text-xs text-muted-foreground">{result.charge_date}</span></div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Scale className="size-3.5" /><span>{result.provider_name || "—"}</span></div>
                </div>
                <div className="grid sm:grid-cols-3">
                  <SummaryAmount label={t(($) => $.table.billed)} value={result.billed_amount} currency={currency} />
                  <SummaryAmount label={t(($) => $.table.expected)} value={result.expected_amount} currency={currency} />
                  <SummaryAmount label={t(($) => $.table.difference)} value={result.diff_amount} currency={currency} emphasis={result.absolute_diff_amount > 0} />
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2"><Link2 className="size-4 text-primary" /><h3 className="text-sm font-semibold">{t(($) => $.detail.context)}</h3></div>
                  <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {[
                      [t(($) => $.detail.match_key), result.match_key],
                      [t(($) => $.detail.match_level), result.match_level],
                      [t(($) => $.detail.batch), result.batch_no],
                      [t(($) => $.detail.allocation), result.allocation_method],
                      [t(($) => $.table.warehouse), result.warehouse_no],
                      [t(($) => $.table.order_tracking), `${result.order_no || "—"} / ${result.logistics_no || "—"}`],
                    ].map(([label, value]) => <div key={label}><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-mono text-xs font-medium">{value || "—"}</dd></div>)}
                  </dl>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2"><DatabaseZap className="size-4 text-primary" /><h3 className="text-sm font-semibold">{t(($) => $.detail.reason_detail)}</h3></div>
                  <p className="mt-4 font-mono text-xs text-warning-foreground">{result.reason_code || "—"}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.reason_detail || "—"}</p>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
                <div className="flex items-center gap-2 border-b p-4"><PackageSearch className="size-4 text-primary" /><h3 className="text-sm font-semibold">{t(($) => $.detail.sku_lines)}</h3><Badge variant="secondary" className="ml-auto font-mono">{lines.length}</Badge></div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[1050px]">
                    <TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead>{t(($) => $.table.sku)}</TableHead><TableHead className="text-right">{t(($) => $.table.quantity)}</TableHead><TableHead>{t(($) => $.detail.weights)}</TableHead><TableHead className="text-right">{t(($) => $.table.billed)}</TableHead><TableHead className="text-right">{t(($) => $.table.expected)}</TableHead><TableHead className="text-right">{t(($) => $.table.difference)}</TableHead><TableHead>{t(($) => $.table.status)}</TableHead><TableHead>{t(($) => $.table.reason)}</TableHead></TableRow></TableHeader>
                    <TableBody>{lines.map((line) => <TableRow key={line.line_id}><TableCell><p className="font-mono text-xs font-medium">{line.sku_code || "—"}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{line.sku_name || "—"}</p></TableCell><TableCell className="text-right font-mono text-xs">{numberFormatter.format(line.quantity)}</TableCell><TableCell><WeightCell row={line} /></TableCell><TableCell className="text-right font-mono text-xs">{formatMoney(line.billed_amount, currency)}</TableCell><TableCell className="text-right font-mono text-xs">{formatMoney(line.expected_amount, currency)}</TableCell><TableCell className={cn("text-right font-mono text-xs font-semibold", line.diff_amount > 0 ? "text-destructive" : line.diff_amount < 0 ? "text-info" : "text-muted-foreground")}>{formatMoney(line.diff_amount, currency)}</TableCell><TableCell><SupplyFeeStatusBadge status={line.result_status} /></TableCell><TableCell className="font-mono text-[11px] text-muted-foreground">{line.reason_code || "—"}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              </section>

              <section className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2"><Calculator className="size-4 text-primary" /><h3 className="text-sm font-semibold">{t(($) => $.detail.evidence)}</h3><Badge variant="secondary" className="ml-auto font-mono">{evidenceRows.length}</Badge></div>
                {evidenceRows.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center text-center"><FileJson2 className="size-5 text-muted-foreground" /><p className="mt-3 text-xs text-muted-foreground">{t(($) => $.detail.empty_evidence)}</p></div> : (
                  <div className="mt-4 space-y-4">{evidenceRows.map((evidence) => <article key={evidence.line_id} className="overflow-hidden rounded-md border"><div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2"><span className="font-mono text-xs font-medium">{evidence.line_id}</span>{evidence.rate_rule_code && <Badge variant="outline">{t(($) => $.detail.rate_rule)} · {evidence.rate_rule_code}</Badge>}{evidence.pricing_model && <Badge variant="outline">{t(($) => $.detail.pricing_model)} · {evidence.pricing_model}</Badge>}</div><div className="grid gap-4 p-3 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-medium">{t(($) => $.detail.raw_bill)}</h4><JsonEvidence value={evidence.raw_bill} /></div><div><h4 className="mb-2 text-xs font-medium">{t(($) => $.detail.formula)}</h4><JsonEvidence value={evidence.formula} /></div></div></article>)}</div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
