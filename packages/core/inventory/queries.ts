import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const inventoryKeys = {
  all: (wsId: string) => ["inventory", wsId] as const,
  dashboard: (wsId: string, filters: Record<string, unknown>, page: number) =>
    [...inventoryKeys.all(wsId), "dashboard", filters, page] as const,
  salesTrend: (wsId: string, days: number, productCode: string, warehouseCodes: string[]) =>
    [...inventoryKeys.all(wsId), "sales-trend", days, productCode, warehouseCodes] as const,
};

export function workspaceInventoryDashboardOptions(
  wsId: string,
  params: { filters?: Record<string, unknown>; page?: number; pageSize?: number } = {},
) {
  const filters = params.filters ?? {};
  const page = params.page ?? 1;
  return queryOptions({
    queryKey: inventoryKeys.dashboard(wsId, filters, page),
    queryFn: () => api.fetchWorkspaceInventoryDashboard(wsId, { ...params, filters, page }),
    staleTime: 30_000,
    enabled: !!wsId,
  });
}

export function workspaceInventorySalesTrendOptions(
  wsId: string,
  params: { days: 7 | 30 | 90; productCode?: string; warehouseCodes?: string[] },
) {
  const productCode = params.productCode ?? "";
  const warehouseCodes = params.warehouseCodes ?? [];
  return queryOptions({
    queryKey: inventoryKeys.salesTrend(wsId, params.days, productCode, warehouseCodes),
    queryFn: () => api.fetchWorkspaceInventorySalesTrend(wsId, params),
    staleTime: 5 * 60_000,
    enabled: !!wsId,
  });
}
