import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { SupplyFeeFilters, SupplyFeeSortBy, SupplyFeeSortDir } from "./types";

export const supplyFeeKeys = {
  all: (wsId: string) => ["supply-fee-reconciliation", wsId] as const,
  config: (wsId: string) => [...supplyFeeKeys.all(wsId), "config"] as const,
  bills: (wsId: string, page: number, pageSize: number) =>
    [...supplyFeeKeys.all(wsId), "bills", page, pageSize] as const,
  bill: (wsId: string, batchId: string) =>
    [...supplyFeeKeys.all(wsId), "bill", batchId] as const,
  dashboard: (wsId: string, filters: SupplyFeeFilters) =>
    [...supplyFeeKeys.all(wsId), "dashboard", filters] as const,
  results: (
    wsId: string,
    filters: SupplyFeeFilters,
    page: number,
    pageSize: number,
    sortBy: SupplyFeeSortBy,
    sortDir: SupplyFeeSortDir,
  ) => [...supplyFeeKeys.all(wsId), "results", filters, page, pageSize, sortBy, sortDir] as const,
  detail: (wsId: string, resultId: string) =>
    [...supplyFeeKeys.all(wsId), "detail", resultId] as const,
};

export function workspaceSupplyFeeBillsOptions(wsId: string, page = 1, pageSize = 30) {
  return queryOptions({
    queryKey: supplyFeeKeys.bills(wsId, page, pageSize),
    queryFn: () => api.fetchWorkspaceSupplyFeeBills(wsId, { page, pageSize }),
    staleTime: 10_000,
    refetchInterval: (query) => query.state.data?.rows.some((batch) =>
      batch.status === "reconciling"
      || batch.latest_run_status === "queued"
      || batch.latest_run_status === "running") ? 2_500 : false,
    enabled: !!wsId,
  });
}

export function workspaceSupplyFeeBillOptions(wsId: string, batchId: string) {
  return queryOptions({
    queryKey: supplyFeeKeys.bill(wsId, batchId),
    queryFn: () => api.fetchWorkspaceSupplyFeeBill(wsId, batchId),
    staleTime: 10_000,
    enabled: !!wsId && !!batchId,
  });
}

export function workspaceSupplyFeeConfigOptions(wsId: string) {
  return queryOptions({
    queryKey: supplyFeeKeys.config(wsId),
    queryFn: () => api.fetchWorkspaceSupplyFeeConfig(wsId),
    staleTime: 5 * 60_000,
    enabled: !!wsId,
  });
}

export function workspaceSupplyFeeDashboardOptions(
  wsId: string,
  filters: SupplyFeeFilters = {},
  enabled = true,
) {
  return queryOptions({
    queryKey: supplyFeeKeys.dashboard(wsId, filters),
    queryFn: () => api.fetchWorkspaceSupplyFeeDashboard(wsId, filters),
    staleTime: 30_000,
    enabled: !!wsId && enabled,
  });
}

export interface WorkspaceSupplyFeeResultsParams {
  filters?: SupplyFeeFilters;
  page?: number;
  pageSize?: number;
  sortBy?: SupplyFeeSortBy;
  sortDir?: SupplyFeeSortDir;
  enabled?: boolean;
}

export function workspaceSupplyFeeResultsOptions(
  wsId: string,
  params: WorkspaceSupplyFeeResultsParams = {},
) {
  const filters = params.filters ?? {};
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;
  const sortBy = params.sortBy ?? "diff_amount";
  const sortDir = params.sortDir ?? "desc";
  return queryOptions({
    queryKey: supplyFeeKeys.results(wsId, filters, page, pageSize, sortBy, sortDir),
    queryFn: () => api.searchWorkspaceSupplyFeeResults(wsId, {
      filters,
      page,
      pageSize,
      sortBy,
      sortDir,
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: !!wsId && (params.enabled ?? true),
  });
}

export function workspaceSupplyFeeResultOptions(wsId: string, resultId: string) {
  return queryOptions({
    queryKey: supplyFeeKeys.detail(wsId, resultId),
    queryFn: () => api.fetchWorkspaceSupplyFeeResult(wsId, resultId),
    staleTime: 30_000,
    enabled: !!wsId && !!resultId,
  });
}
