"use client";

import { useState } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSearch2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@teamify/core/api";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useWorkspacePaths } from "@teamify/core/paths";
import {
  supplyFeeKeys,
  useSupplyFeeFilterStore,
  workspaceSupplyFeeConfigOptions,
  workspaceSupplyFeeResultsOptions,
  type SupplyFeeSortBy,
  type SupplyFeeSortDir,
} from "@teamify/core/supply-reconciliation";
import { Button } from "@teamify/ui/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@teamify/ui/components/ui/select";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";
import { SupplyFeeFilterBar } from "./components/supply-fee-filter-bar";
import { SupplyFeePageHeader } from "./components/supply-fee-page-header";
import { SupplyFeeResultsTable } from "./components/supply-fee-results-table";

export function SupplyReconciliationResultsPage() {
  const { t } = useT("supply-reconciliation");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: supplyFeeKeys.all(wsId) });
  const filters = useSupplyFeeFilterStore((state) => state.filters);
  const page = useSupplyFeeFilterStore((state) => state.page);
  const pageSize = useSupplyFeeFilterStore((state) => state.pageSize);
  const sortBy = useSupplyFeeFilterStore((state) => state.sortBy);
  const sortDir = useSupplyFeeFilterStore((state) => state.sortDir);
  const patchFilters = useSupplyFeeFilterStore((state) => state.patchFilters);
  const clearFilters = useSupplyFeeFilterStore((state) => state.clearFilters);
  const setPage = useSupplyFeeFilterStore((state) => state.setPage);
  const setSort = useSupplyFeeFilterStore((state) => state.setSort);
  const [exporting, setExporting] = useState(false);
  const configQuery = useQuery(workspaceSupplyFeeConfigOptions(wsId));
  const config = configQuery.data;
  const resultsQuery = useQuery(workspaceSupplyFeeResultsOptions(wsId, {
    filters,
    page,
    pageSize,
    sortBy,
    sortDir,
    enabled: config?.available === true && !!config.latest_run_no,
  }));
  const rows = resultsQuery.data?.rows ?? [];
  const total = resultsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const refresh = () => queryClient.invalidateQueries({ queryKey: supplyFeeKeys.all(wsId) });

  const exportRows = async () => {
    setExporting(true);
    try {
      const blob = await api.exportWorkspaceSupplyFeeResults(wsId, { filters, sortBy, sortDir });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `supply-fee-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t(($) => $.actions.export_failed));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SupplyFeePageHeader latestRunNo={config?.latest_run_no} latestRunAt={config?.latest_run_at} refreshing={fetching > 0} onRefresh={refresh} />
      <main className="min-h-0 flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-[1780px] space-y-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div><h2 className="text-lg font-semibold tracking-tight">{t(($) => $.results.title)}</h2><p className="mt-1 text-sm text-muted-foreground">{t(($) => $.results.subtitle)}</p></div>
            <Button size="sm" variant="outline" onClick={exportRows} disabled={exporting || total === 0}>
              <Download className={exporting ? "size-3.5 animate-pulse" : "size-3.5"} />
              {exporting ? t(($) => $.actions.exporting) : t(($) => $.actions.export)}
            </Button>
          </div>

          <SupplyFeeFilterBar extended config={config} filters={filters} onPatch={patchFilters} onClear={clearFilters} />

          {configQuery.isLoading ? <Skeleton className="h-96" /> : configQuery.isError || !config?.available ? (
            <section className="flex min-h-60 flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 text-center">
              <ShieldAlert className="size-6 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.not_configured)}</h2>
              <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{t(($) => $.not_configured_detail)}</p>
            </section>
          ) : !config.latest_run_no ? (
            <section className="flex min-h-60 flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 text-center">
              <FileSearch2 className="size-6 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{t(($) => $.no_successful_run)}</h2>
              <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{t(($) => $.no_successful_run_detail)}</p>
            </section>
          ) : resultsQuery.isLoading ? <Skeleton className="h-96" /> : resultsQuery.isError ? (
            <section className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-center gap-3"><ShieldAlert className="size-5 text-destructive" /><div><h2 className="text-sm font-semibold">{t(($) => $.query_failed)}</h2><p className="mt-0.5 text-xs text-muted-foreground">{t(($) => $.query_failed_detail)}</p></div></div>
              <Button size="sm" variant="outline" onClick={() => resultsQuery.refetch()}>{t(($) => $.refresh)}</Button>
            </section>
          ) : (
            <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center">
                <p className="font-mono text-xs text-muted-foreground">{t(($) => $.results.count, { count: total })}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={sortBy} onValueChange={(value) => setSort(value as SupplyFeeSortBy, sortDir)}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diff_amount">{t(($) => $.results.sort_variance)}</SelectItem>
                      <SelectItem value="charge_date">{t(($) => $.results.sort_date)}</SelectItem>
                      <SelectItem value="billed_amount">{t(($) => $.results.sort_billed)}</SelectItem>
                      <SelectItem value="expected_amount">{t(($) => $.results.sort_expected)}</SelectItem>
                      <SelectItem value="sku_code">{t(($) => $.results.sort_sku)}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortDir} onValueChange={(value) => setSort(sortBy, value as SupplyFeeSortDir)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="desc">{t(($) => $.results.descending)}</SelectItem><SelectItem value="asc">{t(($) => $.results.ascending)}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><FileSearch2 className="size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t(($) => $.results.empty)}</p><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.results.empty_detail)}</p></div>
              ) : <SupplyFeeResultsTable rows={rows} currency={config.default_currency} onOpen={(resultId) => navigation.push(paths.supplyReconciliationResult(resultId))} />}
              <div className="flex items-center justify-between border-t p-3">
                <p className="font-mono text-xs text-muted-foreground">{t(($) => $.pagination, { page, pages })}</p>
                <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t(($) => $.previous)}</Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t(($) => $.next)}</Button></div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
