import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export type ProductCategoryStatus = "all" | "mapped" | "unmapped" | "mixed";

export interface ProductCategoryListParams {
  search?: string;
  category?: string;
  series?: string;
  status?: ProductCategoryStatus;
  page?: number;
  pageSize?: number;
}

export type ProductCategoryListResponse = Awaited<ReturnType<typeof api.fetchWorkspaceProductCategories>>;
export type ProductCategoryRow = ProductCategoryListResponse["rows"][number];

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  const integer = Math.trunc(value);
  return maximum === undefined ? integer : Math.min(integer, maximum);
}

export const productCategoryKeys = {
  all: (wsId: string) => ["product-categories", wsId] as const,
  list: (
    wsId: string,
    search: string,
    category: string,
    series: string,
    status: ProductCategoryStatus,
    page: number,
    pageSize: number,
  ) => [
    ...productCategoryKeys.all(wsId),
    "list",
    search,
    category,
    series,
    status,
    page,
    pageSize,
  ] as const,
};

export function productCategoryListOptions(
  wsId: string,
  params: ProductCategoryListParams = {},
) {
  const search = params.search?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const series = params.series?.trim() ?? "";
  const status = params.status ?? "all";
  const page = normalizePositiveInteger(params.page, 1);
  const pageSize = normalizePositiveInteger(params.pageSize, 30, 100);
  return queryOptions({
    queryKey: productCategoryKeys.list(
      wsId,
      search,
      category,
      series,
      status,
      page,
      pageSize,
    ),
    queryFn: () => api.fetchWorkspaceProductCategories(wsId, {
      search,
      category,
      series,
      status,
      page,
      pageSize,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: !!wsId,
  });
}
