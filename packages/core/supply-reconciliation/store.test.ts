import { beforeEach, describe, expect, it } from "vitest";
import { useSupplyFeeFilterStore } from "./store";

describe("supply fee filter store", () => {
  beforeEach(() => {
    useSupplyFeeFilterStore.setState({
      filters: {},
      page: 1,
      pageSize: 50,
      sortBy: "diff_amount",
      sortDir: "desc",
    });
  });

  it("resets pagination when the filter scope changes", () => {
    useSupplyFeeFilterStore.getState().setPage(4);
    useSupplyFeeFilterStore.getState().patchFilters({ fee_type: "freight", sku: "SKU-1" });
    expect(useSupplyFeeFilterStore.getState().page).toBe(1);
    expect(useSupplyFeeFilterStore.getState().filters).toEqual({ fee_type: "freight", sku: "SKU-1" });
  });

  it("clamps page sizes and resets the page", () => {
    useSupplyFeeFilterStore.getState().setPage(3);
    useSupplyFeeFilterStore.getState().setPageSize(999);
    expect(useSupplyFeeFilterStore.getState().pageSize).toBe(200);
    expect(useSupplyFeeFilterStore.getState().page).toBe(1);
  });

  it("clears all filters without changing the selected sort", () => {
    useSupplyFeeFilterStore.getState().setSort("charge_date", "asc");
    useSupplyFeeFilterStore.getState().setFilters({ provider_id: "42" });
    useSupplyFeeFilterStore.getState().clearFilters();
    expect(useSupplyFeeFilterStore.getState().filters).toEqual({});
    expect(useSupplyFeeFilterStore.getState().sortBy).toBe("charge_date");
    expect(useSupplyFeeFilterStore.getState().sortDir).toBe("asc");
  });
});
