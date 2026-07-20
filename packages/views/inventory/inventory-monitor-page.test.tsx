import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/i18n";
import { InventoryMonitorPage } from "./inventory-monitor-page";

const {
  configQueryFn,
  monitorQueryFn,
  monitorOptionsSpy,
  exportWorkspaceInventoryMonitor,
  downloadBlobSpy,
} = vi.hoisted(() => ({
  configQueryFn: vi.fn(),
  monitorQueryFn: vi.fn(),
  monitorOptionsSpy: vi.fn(),
  exportWorkspaceInventoryMonitor: vi.fn(),
  downloadBlobSpy: vi.fn(),
}));

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/inventory", () => ({
  workspaceInventoryConfigOptions: (wsId: string) => ({
    queryKey: ["inventory", wsId, "config"],
    queryFn: configQueryFn,
    enabled: !!wsId,
  }),
  workspaceInventoryMonitorOptions: (wsId: string, params: Record<string, unknown>) => {
    monitorOptionsSpy(wsId, params);
    return {
      queryKey: ["inventory", wsId, "monitor", params],
      queryFn: monitorQueryFn,
      placeholderData: (previousData: unknown) => previousData,
      enabled: !!wsId && params.enabled === true,
    };
  },
}));

vi.mock("@teamify/core/api", () => ({
  api: {
    exportWorkspaceInventoryMonitor,
  },
}));

vi.mock("../common/download-blob", () => ({
  downloadBlob: downloadBlobSpy,
}));

vi.mock("./components/inventory-section-nav", () => ({
  InventorySectionNav: () => <nav>库存动态 / 库存监控</nav>,
}));

const monitorResponse = {
  meta: {
    sales_through_date: "2026-07-08",
    sales_dates: ["2026-07-06", "2026-07-07", "2026-07-08"],
    sales_months: [
      { month: "2026-02", through_date: "2026-02-28", partial: false },
      { month: "2026-03", through_date: "2026-03-31", partial: false },
      { month: "2026-04", through_date: "2026-04-30", partial: false },
      { month: "2026-05", through_date: "2026-05-31", partial: false },
      { month: "2026-06", through_date: "2026-06-30", partial: false },
      { month: "2026-07", through_date: "2026-07-08", partial: true },
    ],
    turnover_window_days: 3,
    turnover_warning_days: 90,
    inventory_sources: [{
      source: "wdtqj.goods_spec_stocks",
      warehouse_no: "z1092",
      warehouse_name: "嘉兴菜鸟仓",
      warehouse_type: "cloud",
      snapshot_date: "2026-07-15",
      updated_at: "2026-07-15T01:42:32Z",
    }],
  },
  summary: {
    product_count: 2,
    month_net_sales_qty: 409,
    total_stock_qty: 3714,
    cloud_stock_qty: 3714,
    average_daily_sales_3d: 74 / 3,
    overall_turnover_days: 151,
    warning_count: 1,
    no_sales_count: 1,
    monthly_sales: [
      { month: "2026-02", net_sales_qty: 372 },
      { month: "2026-03", net_sales_qty: 196 },
      { month: "2026-04", net_sales_qty: 68 },
      { month: "2026-05", net_sales_qty: 50 },
      { month: "2026-06", net_sales_qty: 77 },
      { month: "2026-07", net_sales_qty: 409 },
    ],
  },
  categories: ["黑巧系列", "坚果巧克力"],
  series: ["日常款", "杏运枣"],
  warehouses: [{
    warehouse_no: "z1092",
    warehouse_name: "嘉兴菜鸟仓",
    warehouse_type: "cloud",
  }],
  rows: [{
    product_no: "s2022042705",
    category_name: "黑巧系列",
    series_name: "日常款",
    material_code: "3.0244",
    material_name: "【诺梵】58g55%黑巧克力",
    month_net_sales_qty: 409,
    monthly_sales: [
      { month: "2026-02", net_sales_qty: 372 },
      { month: "2026-03", net_sales_qty: 196 },
      { month: "2026-04", net_sales_qty: 68 },
      { month: "2026-05", net_sales_qty: 50 },
      { month: "2026-06", net_sales_qty: 77 },
      { month: "2026-07", net_sales_qty: 409 },
    ],
    total_stock_qty: 3661,
    cloud_stock_qty: 3661,
    daily_sales: [
      { date: "2026-07-06", net_sales_qty: 10 },
      { date: "2026-07-07", net_sales_qty: 34 },
      { date: "2026-07-08", net_sales_qty: 30 },
    ],
    average_daily_sales_3d: 74 / 3,
    turnover_days: 148,
    turnover_status: "warning" as const,
  }, {
    product_no: "s2026052202",
    category_name: "坚果巧克力",
    series_name: "杏运枣",
    material_code: "3.6522",
    material_name: "【诺梵】158g枣克力（椰枣）-盒装",
    month_net_sales_qty: 0,
    monthly_sales: [
      { month: "2026-02", net_sales_qty: 0 },
      { month: "2026-03", net_sales_qty: 0 },
      { month: "2026-04", net_sales_qty: 0 },
      { month: "2026-05", net_sales_qty: 0 },
      { month: "2026-06", net_sales_qty: 0 },
      { month: "2026-07", net_sales_qty: 0 },
    ],
    total_stock_qty: 53,
    cloud_stock_qty: 53,
    daily_sales: [
      { date: "2026-07-06", net_sales_qty: 0 },
      { date: "2026-07-07", net_sales_qty: 0 },
      { date: "2026-07-08", net_sales_qty: 0 },
    ],
    average_daily_sales_3d: 0,
    turnover_days: null,
    turnover_status: "no_sales" as const,
  }],
  total: 2,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <InventoryMonitorPage />
    </QueryClientProvider>,
    { locale: "zh-Hans" },
  );
}

describe("InventoryMonitorPage", () => {
  beforeEach(() => {
    configQueryFn.mockReset().mockResolvedValue({
      monitor_available: true,
      monitor_reason: "",
    });
    monitorQueryFn.mockReset().mockResolvedValue(monitorResponse);
    monitorOptionsSpy.mockClear();
    exportWorkspaceInventoryMonitor.mockReset().mockResolvedValue(new Blob(["csv"]));
    downloadBlobSpy.mockReset();
  });

  it("renders the independent monitor matrix with dynamic dates and turnover states", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "库存动销监控" })).toBeInTheDocument();
    expect(screen.getByText("销量截至 2026-07-08")).toBeInTheDocument();
    expect(screen.getByText("库存快照时间：2026-07-15 09:42")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "7月6日" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "7月8日" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "近 6 个月月净销量" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "2月" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "7月（截至8日）" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "品类" })).toHaveTextContent("全部品类");
    expect(screen.getByRole("combobox", { name: "仓库" })).toHaveTextContent("全部仓库");

    const warningRow = screen.getByText("3.0244").closest("tr");
    expect(warningRow).not.toBeNull();
    expect(within(warningRow!).getByText("372")).toBeInTheDocument();
    expect(within(warningRow!).getByText("148")).toHaveClass("text-destructive");

    const noSalesRow = screen.getByText("3.6522").closest("tr");
    expect(noSalesRow).not.toBeNull();
    expect(within(noSalesRow!).getByText("无动销")).toBeInTheDocument();
    expect(screen.getByText("当前筛选小计")).toBeInTheDocument();
    expect(monitorOptionsSpy).toHaveBeenLastCalledWith(
      "ws-1",
      expect.objectContaining({ enabled: true, turnoverStatus: "all", warehouseNo: "" }),
    );
  });

  it("does not query the matrix until all monitor tables are available", async () => {
    configQueryFn.mockResolvedValue({
      monitor_available: false,
      monitor_reason: "tables_missing",
    });

    renderPage();

    expect(await screen.findByText("库存监控尚未配置")).toBeInTheDocument();
    expect(monitorQueryFn).not.toHaveBeenCalled();
    expect(monitorOptionsSpy).toHaveBeenLastCalledWith(
      "ws-1",
      expect.objectContaining({ enabled: false }),
    );
  });

  it("passes the selected warehouse to the monitor query", async () => {
    const user = userEvent.setup();
    renderPage();

    const warehouseFilter = await screen.findByRole("combobox", { name: "仓库" });
    await user.click(warehouseFilter);
    const warehouseOption = await screen.findByRole("option", { name: "嘉兴菜鸟仓" });
    expect(warehouseOption.closest('[data-slot="browser-fullscreen-frame"]')).not.toBeNull();
    await user.click(warehouseOption);

    await waitFor(() => {
      expect(monitorOptionsSpy).toHaveBeenLastCalledWith(
        "ws-1",
        expect.objectContaining({ warehouseNo: "z1092" }),
      );
    });
    await waitFor(() => expect(warehouseFilter).toHaveTextContent("嘉兴菜鸟仓"));
  });

  it("offers fullscreen and downloads the current filtered detail rows from the backend export", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "全屏查看明细表" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下载当前筛选结果" }));

    await waitFor(() => {
      expect(exportWorkspaceInventoryMonitor).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          search: "",
          category: "",
          series: "",
          warehouseNo: "",
          turnoverStatus: "all",
        }),
      );
    });
    expect(downloadBlobSpy).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^库存动销监控-\d{4}-\d{2}-\d{2}\.csv$/));
  });
});
