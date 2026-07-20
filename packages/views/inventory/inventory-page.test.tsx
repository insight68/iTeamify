import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/i18n";
import { InventoryPage } from "./inventory-page";

const {
  dashboardOptionsSpy,
  dashboardQueryFn,
  configQueryFn,
  inventoryStockPanelSpy,
  salesTrendPanelSpy,
  navigationPush,
} = vi.hoisted(() => ({
  dashboardOptionsSpy: vi.fn(),
  dashboardQueryFn: vi.fn(),
  configQueryFn: vi.fn(),
  inventoryStockPanelSpy: vi.fn(),
  salesTrendPanelSpy: vi.fn(),
  navigationPush: vi.fn(),
}));

const inventoryConfig = {
  inventory_available: true,
  inventory_reason: "",
  latest_inventory_date: "2026-07-13",
  latest_inventory_updated_at: "2026-07-13T02:32:18Z",
  inventory_stale: false,
  sales_trend_available: true,
  sales_trend_reason: "",
  allocation_available: false,
  allocation_reason: "tables_missing",
  latest_stat_date: "2026-07-12",
  refresh_interval_minutes: 60,
  read_only: true,
};

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/paths", () => ({
  useWorkspacePaths: () => ({
    inventory: () => "/demo/inventory",
    inventoryMonitor: () => "/demo/inventory/monitor",
  }),
}));

vi.mock("../navigation", () => ({
  useNavigation: () => ({
    pathname: "/demo/inventory",
    push: navigationPush,
  }),
}));

vi.mock("@teamify/core/inventory", () => ({
  workspaceInventoryConfigOptions: (wsId: string) => ({
    queryKey: ["inventory", wsId, "config"],
    queryFn: configQueryFn,
    enabled: !!wsId,
  }),
  workspaceInventoryDashboardOptions: (
    wsId: string,
    params: { enabled?: boolean },
  ) => {
    dashboardOptionsSpy(wsId, params);
    return {
      queryKey: ["inventory", wsId, "dashboard"],
      queryFn: dashboardQueryFn,
      enabled: !!wsId && (params.enabled ?? true),
    };
  },
}));

vi.mock("./components/sales-trend-panel", () => ({
  SalesTrendPanel: (props: {
    availability: "checking" | "available" | "not-configured" | "unavailable";
    comparisonAvailable: boolean;
  }) => {
    salesTrendPanelSpy(props);
    return <div data-testid="sales-trend-panel">{props.availability}</div>;
  },
}));

vi.mock("./components/inventory-stock-panel", () => ({
  InventoryStockPanel: (props: {
    availability: "checking" | "available" | "not-configured" | "unavailable";
  }) => {
    inventoryStockPanelSpy(props);
    return <div data-testid="inventory-stock-panel">{props.availability}</div>;
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <InventoryPage />
    </QueryClientProvider>,
    { locale: "zh-Hans" },
  );
}

describe("InventoryPage", () => {
  beforeEach(() => {
    dashboardOptionsSpy.mockClear();
    dashboardQueryFn.mockReset();
    configQueryFn.mockReset().mockResolvedValue(inventoryConfig);
    inventoryStockPanelSpy.mockClear();
    salesTrendPanelSpy.mockClear();
    navigationPush.mockClear();
  });

  it("shows the latest inventory independently when allocation tables are unavailable", async () => {
    renderPage();

    expect(await screen.findByText("调拨建议尚未配置")).toBeInTheDocument();
    expect(screen.getByTestId("inventory-stock-panel")).toHaveTextContent("available");
    expect(screen.getByText(/销量走势独立配置/)).toBeInTheDocument();
    expect(screen.getByTestId("sales-trend-panel")).toHaveTextContent("available");
    expect(screen.getByText("库存快照时间：2026-07-13 10:32")).toBeInTheDocument();

    await waitFor(() => {
      expect(inventoryStockPanelSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ availability: "available" }),
      );
      expect(salesTrendPanelSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          availability: "available",
          comparisonAvailable: false,
        }),
      );
    });
    expect(dashboardOptionsSpy).toHaveBeenLastCalledWith(
      "ws-1",
      expect.objectContaining({ enabled: false }),
    );
    expect(dashboardQueryFn).not.toHaveBeenCalled();
  });

  it("keeps the last known capabilities after a background refresh fails", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("sales-trend-panel")).toHaveTextContent("available");
    });

    configQueryFn.mockRejectedValueOnce(new Error("temporary connection failure"));
    fireEvent.click(screen.getAllByRole("button", { name: "刷新" })[0]!);

    expect(await screen.findByText("库存状态刷新失败")).toBeInTheDocument();
    expect(screen.getByTestId("sales-trend-panel")).toHaveTextContent("available");
    expect(screen.getByText("调拨建议尚未配置")).toBeInTheDocument();
    expect(dashboardQueryFn).not.toHaveBeenCalled();
  });

  it("shows inventory freshness without the removed sales freshness warning", async () => {
    configQueryFn.mockResolvedValue({
      ...inventoryConfig,
      inventory_stale: true,
      // A legacy server may still return this field during a rolling deploy.
      stale: true,
    });

    renderPage();

    expect(await screen.findByText("库存快照时间：2026-07-13 10:32")).toBeInTheDocument();
    expect(screen.getByText("库存数据更新延迟")).toBeInTheDocument();
    expect(screen.queryByText("销量数据更新延迟")).not.toBeInTheDocument();
  });

  it("falls back to the snapshot business date during a rolling deploy", async () => {
    configQueryFn.mockResolvedValue({
      ...inventoryConfig,
      latest_inventory_updated_at: "",
    });

    renderPage();

    expect(await screen.findByText("库存快照日期：2026-07-13")).toBeInTheDocument();
  });
});
