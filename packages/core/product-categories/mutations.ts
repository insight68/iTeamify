import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "../api";
import { inventoryKeys } from "../inventory/queries";
import {
  productCategoryKeys,
  type ProductCategoryListResponse,
} from "./queries";

export interface UpdateProductCategoryInput {
  materialCode: string;
  businessCategoryName: string;
  productSeriesName: string;
}

function addSortedOption(values: string[], value: string) {
  if (!value || values.includes(value)) return values;
  return [...values, value].sort((left, right) => left.localeCompare(right));
}

export function useUpdateProductCategory(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProductCategoryInput) => {
      const result = await api.updateWorkspaceProductCategory(wsId, input);
      if (result.success !== true) {
        throw new Error("The server returned an invalid product category update response");
      }
      return result;
    },
    onMutate: async (input) => {
      const queryKey = productCategoryKeys.all(wsId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData<ProductCategoryListResponse>({ queryKey });
      const category = input.businessCategoryName.trim();
      const series = input.productSeriesName.trim();
      const nextStatus = category || series ? "mapped" : "unmapped";
      const now = new Date().toISOString();

      for (const [key, cached] of previous) {
        if (!cached) continue;
        const previousRow = cached.rows.find((row) => row.material_code === input.materialCode);
        const summary = { ...cached.summary };
        if (previousRow && previousRow.taxonomy_status !== nextStatus) {
          if (previousRow.taxonomy_status === "mapped") summary.mapped = Math.max(0, summary.mapped - 1);
          if (previousRow.taxonomy_status === "unmapped") summary.unmapped = Math.max(0, summary.unmapped - 1);
          if (previousRow.taxonomy_status === "mixed") summary.mixed = Math.max(0, summary.mixed - 1);
          if (nextStatus === "mapped") summary.mapped += 1;
          if (nextStatus === "unmapped") summary.unmapped += 1;
        }
        queryClient.setQueryData<ProductCategoryListResponse>(key, {
          ...cached,
          summary,
          categories: addSortedOption(cached.categories, category),
          series: addSortedOption(cached.series, series),
          rows: cached.rows.map((row) => row.material_code === input.materialCode
            ? {
                ...row,
                business_category_name: category,
                product_series_name: series,
                taxonomy_status: nextStatus,
                taxonomy_source: nextStatus === "mapped" ? "business_mapping_v1" : "",
                taxonomy_updated_at: now,
              }
            : row),
        });
      }

      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, cached] of context?.previous ?? []) {
        queryClient.setQueryData(key as QueryKey, cached);
      }
    },
    onSuccess: (result) => {
      const queryKey = productCategoryKeys.all(wsId);
      for (const [key, cached] of queryClient.getQueriesData<ProductCategoryListResponse>({ queryKey })) {
        if (!cached) continue;
        queryClient.setQueryData<ProductCategoryListResponse>(key, {
          ...cached,
          rows: cached.rows.map((row) => row.material_code === result.row.material_code
            ? result.row
            : row),
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productCategoryKeys.all(wsId) });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all(wsId) });
    },
  });
}
