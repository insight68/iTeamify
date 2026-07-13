import { describe, it, expect, beforeEach } from "vitest";
import { useReconciliationFilterStore } from "./store";

describe("useReconciliationFilterStore", () => {
  beforeEach(() => {
    // Reset store between tests
    useReconciliationFilterStore.setState({
      filters: {},
      sessionFilters: {},
      selectedBatchNo: null,
    });
  });

  it("sets and clears user-selected filters", () => {
    const { setFilters, clearFilters } = useReconciliationFilterStore.getState();
    setFilters({ shop_name: "天猫" });
    expect(useReconciliationFilterStore.getState().filters).toEqual({
      shop_name: "天猫",
    });

    clearFilters();
    expect(useReconciliationFilterStore.getState().filters).toEqual({});
  });

  it("sets session-scoped filters independently per session", () => {
    const { setSessionFilters } = useReconciliationFilterStore.getState();
    setSessionFilters("session-a", { platform: "京东" });
    setSessionFilters("session-b", { platform: "抖音" });

    const state = useReconciliationFilterStore.getState();
    expect(state.sessionFilters["session-a"]).toEqual({ platform: "京东" });
    expect(state.sessionFilters["session-b"]).toEqual({ platform: "抖音" });
  });

  it("clears session-scoped filters for one session without touching others", () => {
    const { setSessionFilters, clearSessionFilters } = useReconciliationFilterStore.getState();
    setSessionFilters("session-a", { platform: "京东" });
    setSessionFilters("session-b", { platform: "抖音" });

    clearSessionFilters("session-a");

    const state = useReconciliationFilterStore.getState();
    expect(state.sessionFilters["session-a"]).toBeUndefined();
    expect(state.sessionFilters["session-b"]).toEqual({ platform: "抖音" });
  });

  it("sets and clears selected batch no for drill-down", () => {
    const { setSelectedBatchNo } = useReconciliationFilterStore.getState();
    setSelectedBatchNo("batch-123");
    expect(useReconciliationFilterStore.getState().selectedBatchNo).toBe("batch-123");

    setSelectedBatchNo(null);
    expect(useReconciliationFilterStore.getState().selectedBatchNo).toBeNull();
  });

  it("overwrites session filters when set twice for the same session", () => {
    const { setSessionFilters } = useReconciliationFilterStore.getState();
    setSessionFilters("session-a", { platform: "京东" });
    setSessionFilters("session-a", { platform: "天猫", shop_name: "旗舰店" });

    expect(useReconciliationFilterStore.getState().sessionFilters["session-a"]).toEqual({
      platform: "天猫",
      shop_name: "旗舰店",
    });
  });
});
