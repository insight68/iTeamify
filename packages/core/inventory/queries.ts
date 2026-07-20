import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const INVENTORY_REFRESH_INTERVAL_MS = 60 * 60_000;

export const inventoryKeys = {
  all: (wsId: string) => ["inventory", wsId] as const,
  config: (wsId: string) => [...inventoryKeys.all(wsId), "config"] as const,
  dashboard: (wsId: string, filters: Record<string, unknown>, page: number) =>
    [...inventoryKeys.all(wsId), "dashboard", filters, page] as const,
  stock: (
    wsId: string,
    search: string,
    warehouseNo: string,
    page: number,
    pageSize: number,
  ) => [...inventoryKeys.all(wsId), "stock", search, warehouseNo, page, pageSize] as const,
  monitor: (
    wsId: string,
    search: string,
    category: string,
    series: string,
    warehouseNo: string,
    turnoverStatus: InventoryMonitorTurnoverStatus,
  ) => [...inventoryKeys.all(wsId), "monitor", search, category, series, warehouseNo, turnoverStatus] as const,
  salesTrend: (wsId: string, days: number, productCode: string, warehouseCodes: string[]) =>
    [...inventoryKeys.all(wsId), "sales-trend", days, productCode, warehouseCodes] as const,
};

export function workspaceInventoryConfigOptions(wsId: string) {
  return queryOptions({
    queryKey: inventoryKeys.config(wsId),
    queryFn: () => api.fetchWorkspaceInventoryConfig(wsId),
    staleTime: 60_000,
    refetchInterval: INVENTORY_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: !!wsId,
  });
}

export function workspaceInventoryDashboardOptions(
  wsId: string,
  params: { filters?: Record<string, unknown>; page?: number; pageSize?: number; enabled?: boolean } = {},
) {
  const filters = params.filters ?? {};
  const page = params.page ?? 1;
  const enabled = params.enabled ?? true;
  return queryOptions({
    queryKey: inventoryKeys.dashboard(wsId, filters, page),
    queryFn: () => api.fetchWorkspaceInventoryDashboard(wsId, {
      filters,
      page,
      pageSize: params.pageSize,
    }),
    staleTime: 30_000,
    refetchInterval: INVENTORY_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: !!wsId && enabled,
  });
}

export interface WorkspaceInventoryStockParams {
  search?: string;
  warehouseNo?: string;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export type InventoryMonitorTurnoverStatus = "all" | "normal" | "warning" | "no_sales";
export type WorkspaceInventoryMonitorResponse = Awaited<ReturnType<typeof api.fetchWorkspaceInventoryMonitor>>;
export type InventoryMonitorRow = WorkspaceInventoryMonitorResponse["rows"][number];
export type InventoryMonitorSalesMonth = WorkspaceInventoryMonitorResponse["meta"]["sales_months"][number];
export type InventoryMonitorMonthlySales = InventoryMonitorRow["monthly_sales"][number];

export interface WorkspaceInventoryMonitorParams {
  search?: string;
  category?: string;
  series?: string;
  warehouseNo?: string;
  turnoverStatus?: InventoryMonitorTurnoverStatus;
  enabled?: boolean;
}

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  const normalized = Math.trunc(value);
  return maximum === undefined ? normalized : Math.min(maximum, normalized);
}

export function workspaceInventoryStockOptions(
  wsId: string,
  params: WorkspaceInventoryStockParams = {},
) {
  const search = params.search?.trim() ?? "";
  const warehouseNo = params.warehouseNo?.trim() ?? "";
  const page = normalizePositiveInteger(params.page, 1);
  const pageSize = normalizePositiveInteger(params.pageSize, 30, 100);
  return queryOptions({
    queryKey: inventoryKeys.stock(wsId, search, warehouseNo, page, pageSize),
    queryFn: () => api.fetchWorkspaceInventoryStock(wsId, {
      search,
      warehouseNo,
      page,
      pageSize,
    }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchInterval: INVENTORY_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: !!wsId && (params.enabled ?? true),
  });
}

export function workspaceInventoryMonitorOptions(
  wsId: string,
  params: WorkspaceInventoryMonitorParams = {},
) {
  const search = params.search?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const series = params.series?.trim() ?? "";
  const warehouseNo = params.warehouseNo?.trim() ?? "";
  const turnoverStatus = params.turnoverStatus ?? "all";
  return queryOptions({
    queryKey: inventoryKeys.monitor(wsId, search, category, series, warehouseNo, turnoverStatus),
    queryFn: () => api.fetchWorkspaceInventoryMonitor(wsId, {
      search,
      category,
      series,
      warehouseNo,
      turnoverStatus,
    }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchInterval: INVENTORY_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: !!wsId && (params.enabled ?? true),
  });
}

export function workspaceInventorySalesTrendOptions(
  wsId: string,
  params: { days: 7 | 30 | 90; productCode?: string; warehouseCodes?: string[]; enabled?: boolean },
) {
  const productCode = params.productCode ?? "";
  const warehouseCodes = params.warehouseCodes ?? [];
  return queryOptions({
    queryKey: inventoryKeys.salesTrend(wsId, params.days, productCode, warehouseCodes),
    queryFn: () => api.fetchWorkspaceInventorySalesTrend(wsId, {
      days: params.days,
      productCode: params.productCode,
      warehouseCodes: params.warehouseCodes,
    }),
    staleTime: 5 * 60_000,
    refetchInterval: INVENTORY_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: !!wsId && (params.enabled ?? true),
  });
}
