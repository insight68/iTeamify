import { describe, expect, it } from "vitest";
import { keepPreviousData } from "@tanstack/react-query";
import {
  INVENTORY_REFRESH_INTERVAL_MS,
  workspaceInventoryConfigOptions,
  workspaceInventoryDashboardOptions,
  workspaceInventoryStockOptions,
  workspaceInventoryMonitorOptions,
  workspaceInventorySalesTrendOptions,
} from "./queries";

describe("inventory query option gating", () => {
  it("keeps active inventory queries on the hourly freshness SLA", () => {
    expect(workspaceInventoryConfigOptions("workspace-1").refetchInterval)
      .toBe(INVENTORY_REFRESH_INTERVAL_MS);
    expect(workspaceInventoryDashboardOptions("workspace-1").refetchInterval)
      .toBe(INVENTORY_REFRESH_INTERVAL_MS);
    expect(workspaceInventoryStockOptions("workspace-1").refetchInterval)
      .toBe(INVENTORY_REFRESH_INTERVAL_MS);
    expect(workspaceInventoryStockOptions("workspace-1").refetchOnWindowFocus)
      .toBe(true);
    expect(workspaceInventorySalesTrendOptions("workspace-1", { days: 30 }).refetchInterval)
      .toBe(INVENTORY_REFRESH_INTERVAL_MS);
    expect(workspaceInventorySalesTrendOptions("workspace-1", { days: 30 }).refetchOnWindowFocus)
      .toBe(true);
    expect(workspaceInventoryMonitorOptions("workspace-1").refetchInterval)
      .toBe(INVENTORY_REFRESH_INTERVAL_MS);
    expect(workspaceInventoryMonitorOptions("workspace-1").refetchOnWindowFocus)
      .toBe(true);
  });

  it("gates config queries on the workspace id", () => {
    expect(workspaceInventoryConfigOptions("").enabled).toBe(false);
    expect(workspaceInventoryConfigOptions("workspace-1").enabled).toBe(true);
  });

  it("does not enable dashboard queries before allocation is available", () => {
    expect(workspaceInventoryDashboardOptions("workspace-1", { enabled: false }).enabled)
      .toBe(false);
    expect(workspaceInventoryDashboardOptions("", { enabled: true }).enabled)
      .toBe(false);
    expect(workspaceInventoryDashboardOptions("workspace-1").enabled)
      .toBe(true);
  });

  it("does not enable sales trend queries before product-order data is available", () => {
    expect(workspaceInventorySalesTrendOptions("workspace-1", { days: 30, enabled: false }).enabled)
      .toBe(false);
    expect(workspaceInventorySalesTrendOptions("", { days: 30, enabled: true }).enabled)
      .toBe(false);
    expect(workspaceInventorySalesTrendOptions("workspace-1", { days: 30 }).enabled)
      .toBe(true);
  });

  it("does not enable stock queries before inventory data is available", () => {
    expect(workspaceInventoryStockOptions("workspace-1", { enabled: false }).enabled)
      .toBe(false);
    expect(workspaceInventoryStockOptions("", { enabled: true }).enabled)
      .toBe(false);
    expect(workspaceInventoryStockOptions("workspace-1").enabled)
      .toBe(true);
  });

  it("does not enable monitor queries before all monitor capabilities are available", () => {
    expect(workspaceInventoryMonitorOptions("workspace-1", { enabled: false }).enabled)
      .toBe(false);
    expect(workspaceInventoryMonitorOptions("", { enabled: true }).enabled)
      .toBe(false);
    expect(workspaceInventoryMonitorOptions("workspace-1").enabled)
      .toBe(true);
  });

  it("normalizes monitor filters in the query key and keeps prior rows", () => {
    const options = workspaceInventoryMonitorOptions("workspace-1", {
      search: "  3.0244 ",
      category: " 黑巧系列 ",
      series: " 日常款 ",
      warehouseNo: " z1092 ",
      turnoverStatus: "warning",
    });
    expect(options.queryKey).toEqual([
      "inventory",
      "workspace-1",
      "monitor",
      "3.0244",
      "黑巧系列",
      "日常款",
      "z1092",
      "warning",
    ]);
    expect(options.placeholderData).toBe(keepPreviousData);
  });

  it("normalizes every stock request field in the query key", () => {
    expect(workspaceInventoryStockOptions("workspace-1", {
      search: "  SKU 001  ",
      warehouseNo: "  WH-01 ",
      page: 2.9,
      pageSize: 500,
    }).queryKey).toEqual([
      "inventory",
      "workspace-1",
      "stock",
      "SKU 001",
      "WH-01",
      2,
      100,
    ]);

    expect(workspaceInventoryStockOptions("workspace-1", {
      page: Number.NaN,
      pageSize: 0,
    }).queryKey).toEqual([
      "inventory",
      "workspace-1",
      "stock",
      "",
      "",
      1,
      30,
    ]);
  });

  it("retains the current stock response while filters or pages change", () => {
    expect(workspaceInventoryStockOptions("workspace-1").placeholderData)
      .toBe(keepPreviousData);
  });
});
