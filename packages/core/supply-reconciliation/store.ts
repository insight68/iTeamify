import { create } from "zustand";
import type { SupplyFeeFilters, SupplyFeeSortBy, SupplyFeeSortDir } from "./types";

export interface SupplyFeeFilterState {
  filters: SupplyFeeFilters;
  page: number;
  pageSize: number;
  sortBy: SupplyFeeSortBy;
  sortDir: SupplyFeeSortDir;
  setFilters: (filters: SupplyFeeFilters) => void;
  patchFilters: (filters: Partial<SupplyFeeFilters>) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sortBy: SupplyFeeSortBy, sortDir: SupplyFeeSortDir) => void;
}

export const useSupplyFeeFilterStore = create<SupplyFeeFilterState>((set) => ({
  filters: {},
  page: 1,
  pageSize: 50,
  sortBy: "diff_amount",
  sortDir: "desc",
  setFilters: (filters) => set({ filters, page: 1 }),
  patchFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters },
    page: 1,
  })),
  clearFilters: () => set({ filters: {}, page: 1 }),
  setPage: (page) => set({ page: Math.max(1, Math.trunc(page)) }),
  setPageSize: (pageSize) => set({ pageSize: Math.min(200, Math.max(1, Math.trunc(pageSize))), page: 1 }),
  setSort: (sortBy, sortDir) => set({ sortBy, sortDir, page: 1 }),
}));
