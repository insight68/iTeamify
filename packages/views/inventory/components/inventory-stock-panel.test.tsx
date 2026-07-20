import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../../test/i18n";
import { InventoryStockPanel } from "./inventory-stock-panel";

const { stockOptionsSpy, stockQueryFn } = vi.hoisted(() => ({
  stockOptionsSpy: vi.fn(),
  stockQueryFn: vi.fn(),
}));

vi.mock("@teamify/core/inventory", () => ({
  workspaceInventoryStockOptions: (
    wsId: string,
    params: {
      search?: string;
      warehouseNo?: string;
      page?: number;
      pageSize?: number;
      enabled?: boolean;
    },
  ) => {
    stockOptionsSpy(wsId, params);
    return {
      queryKey: ["inventory", wsId, "stock", params],
      queryFn: stockQueryFn,
      placeholderData: keepPreviousData,
      enabled: !!wsId && (params.enabled ?? true),
    };
  },
}));

const stockResponse = {
  snapshot_date: "2026-07-13",
  summary: {
    goods_count: 18,
    warehouse_count: 2,
    record_count: 18,
    qty_on_hand: 327_989,
    qty_available: 327_897,
    qty_in_transit: 92,
    qty_locked: 10,
    qty_reserved: 5,
    qty_damaged: 1,
  },
  warehouses: [
    { warehouse_no: "003", warehouse_name: "洛菲成品仓", warehouse_type: "lofi" },
    { warehouse_no: "088", warehouse_name: "生产产成品仓", warehouse_type: "factory" },
  ],
  rows: [
    {
      goods_no: "300001",
      goods_name: "洗衣凝珠",
      warehouse_no: "003",
      warehouse_name: "洛菲成品仓",
      warehouse_type: "lofi",
      unit_name: "盒",
      batch_count: 2,
      qty_on_hand: 100,
      qty_available: 85,
      qty_in_transit: 10,
      qty_locked: 3,
      qty_reserved: 2,
      qty_damaged: 0,
    },
  ],
  total: 1,
};

function renderPanel(availability: "checking" | "available" | "not-configured" | "unavailable" = "available") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onRetryAvailability = vi.fn();

  renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <InventoryStockPanel
        wsId="ws-1"
        availability={availability}
        onRetryAvailability={onRetryAvailability}
      />
    </QueryClientProvider>,
    { locale: "zh-Hans" },
  );

  return { onRetryAvailability, queryClient };
}

describe("InventoryStockPanel", () => {
  beforeEach(() => {
    stockOptionsSpy.mockClear();
    stockQueryFn.mockReset().mockResolvedValue(stockResponse);
  });

  it("renders the latest snapshot summary and product-by-warehouse rows", async () => {
    renderPanel();

    expect(await screen.findByText("洗衣凝珠")).toBeInTheDocument();
    expect(screen.getByText("快照 2026-07-13")).toBeInTheDocument();
    expect(screen.getByText("327,897")).toBeInTheDocument();
    expect(screen.getByText("18 个 SKU / 2 个仓")).toBeInTheDocument();
    expect(
      screen.getByText("汇总最新快照，按商品与仓库查看可用、锁定及在途库存"),
    ).toBeInTheDocument();
    expect(screen.getByText("洛菲成品仓")).toBeInTheDocument();
    expect(screen.getByText("2 个批次")).toBeInTheDocument();
  });

  it("debounces product search and keeps controls mounted while the next query loads", async () => {
    renderPanel();
    await screen.findByText("洗衣凝珠");
    const searchInput = screen.getByRole("searchbox", {
      name: "按商品名称或编码搜索库存",
    });
    expect(searchInput).toHaveAttribute("maxlength", "200");
    searchInput.focus();
    const initialRequestCount = stockQueryFn.mock.calls.length;
    stockQueryFn.mockImplementationOnce(() => new Promise(() => {}));

    fireEvent.change(searchInput, { target: { value: "洗" } });
    fireEvent.change(searchInput, { target: { value: "  洗衣  " } });

    expect(stockQueryFn).toHaveBeenCalledTimes(initialRequestCount);

    await waitFor(() => {
      expect(stockOptionsSpy).toHaveBeenLastCalledWith(
        "ws-1",
        expect.objectContaining({ search: "洗衣", page: 1, enabled: true }),
      );
      expect(stockQueryFn).toHaveBeenCalledTimes(initialRequestCount + 1);
    });
    expect(screen.getByRole("searchbox", { name: "按商品名称或编码搜索库存" })).toBe(searchInput);
    expect(searchInput).toHaveFocus();
    expect(screen.getByText("洗衣凝珠")).toBeInTheDocument();
    expect(screen.getByText("正在更新库存")).toBeInTheDocument();
  });

  it("keeps the last successful snapshot after a background refresh fails", async () => {
    const { queryClient } = renderPanel();
    await screen.findByText("洗衣凝珠");
    stockQueryFn.mockRejectedValueOnce(new Error("temporary connection failure"));

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory", "ws-1", "stock"] });
    });

    expect(await screen.findByText("库存刷新失败")).toBeInTheDocument();
    expect(screen.getByText("继续显示最近一次成功快照，连接恢复后可重试。")).toBeInTheDocument();
    expect(screen.getByText("洗衣凝珠")).toBeInTheDocument();
    expect(screen.getByText("327,897")).toBeInTheDocument();
    expect(screen.queryByText("最近快照加载失败，不影响独立的销量走势和调拨建议模块。")).not.toBeInTheDocument();
  });

  it("does not query stock while the data source is not configured", () => {
    renderPanel("not-configured");

    expect(screen.getByText("库存快照尚未配置")).toBeInTheDocument();
    expect(stockQueryFn).not.toHaveBeenCalled();
    expect(stockOptionsSpy).toHaveBeenLastCalledWith(
      "ws-1",
      expect.objectContaining({ enabled: false }),
    );
  });

  it("retries capability detection from the unavailable state", () => {
    const { onRetryAvailability } = renderPanel("unavailable");

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetryAvailability).toHaveBeenCalledTimes(1);
    expect(stockQueryFn).not.toHaveBeenCalled();
  });
});
