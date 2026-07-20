import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClient } from "./client";
import { parseWithFallback } from "./schema";

// Helper: stub fetch with a single JSON response. Status defaults to 200.
function stubFetchJson(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// These tests cover the five failure modes that white-screened the desktop
// app in past incidents. The contract is: a malformed response degrades to
// an empty/safe shape, never throws into React.
describe("ApiClient schema fallback", () => {
  describe("listTimeline", () => {
    it("falls back to an empty array when the body is null", async () => {
      stubFetchJson(null);
      const client = new ApiClient("https://api.example.test");
      const entries = await client.listTimeline("issue-1");
      expect(entries).toEqual([]);
    });

    it("falls back when the body is not an array", async () => {
      stubFetchJson({ wrong: "shape" });
      const client = new ApiClient("https://api.example.test");
      const entries = await client.listTimeline("issue-1");
      expect(entries).toEqual([]);
    });

    it("accepts a new entry type rather than crashing on enum drift", async () => {
      stubFetchJson([
        {
          type: "future_kind", // not in TS union
          id: "e-1",
          actor_type: "member",
          actor_id: "u-1",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]);
      const client = new ApiClient("https://api.example.test");
      const entries = await client.listTimeline("issue-1");
      expect(entries).toHaveLength(1);
      expect(entries[0]?.type).toBe("future_kind");
    });

    // Forward-compat: when the server adds a new field to an existing
    // shape, `.loose()` lets it pass through unchanged. Without `.loose()`
    // zod 4 strips it, which would silently break a future TS type that
    // adopts the field — see schemas.ts header comment.
    it("preserves unknown fields the schema didn't list", async () => {
      stubFetchJson([
        {
          type: "comment",
          id: "e-1",
          actor_type: "member",
          actor_id: "u-1",
          created_at: "2026-01-01T00:00:00Z",
          // New server-side field not present in TimelineEntrySchema:
          future_field: { nested: "value" },
        },
      ]);
      const client = new ApiClient("https://api.example.test");
      const entries = await client.listTimeline("issue-1");
      const entry = entries[0] as unknown as Record<string, unknown>;
      expect(entry.future_field).toEqual({ nested: "value" });
    });
  });

  describe("listIssues", () => {
    it("falls back to an empty list when the response is malformed", async () => {
      // `issues` having the wrong type triggers the fallback. An object
      // with only unexpected keys would *succeed* parsing now (every
      // declared field has a default) and just pass the extras through
      // via `.loose()`, so we use a wrong-type payload here instead.
      stubFetchJson({ issues: "not-an-array", total: 0 });
      const client = new ApiClient("https://api.example.test");
      const res = await client.listIssues();
      expect(res).toEqual({ issues: [], total: 0 });
    });
  });

  describe("listComments", () => {
    it("returns [] when the response is not an array", async () => {
      stubFetchJson({ wrong: "shape" });
      const client = new ApiClient("https://api.example.test");
      const comments = await client.listComments("issue-1");
      expect(comments).toEqual([]);
    });
  });

  describe("listIssueSubscribers", () => {
    it("returns [] when the response is null", async () => {
      stubFetchJson(null);
      const client = new ApiClient("https://api.example.test");
      const subs = await client.listIssueSubscribers("issue-1");
      expect(subs).toEqual([]);
    });
  });

  describe("listChildIssues", () => {
    it("returns { issues: [] } when the issues field is missing", async () => {
      stubFetchJson({});
      const client = new ApiClient("https://api.example.test");
      const res = await client.listChildIssues("issue-1");
      expect(res).toEqual({ issues: [] });
    });
  });

  describe("fetchWorkspaceInventoryStock", () => {
    it("falls back to an empty stock response when the body is null", async () => {
      stubFetchJson(null);
      const client = new ApiClient("https://api.example.test");
      const result = await client.fetchWorkspaceInventoryStock("workspace-1");

      expect(result).toEqual({
        snapshot_date: "",
        summary: {
          goods_count: 0,
          warehouse_count: 0,
          record_count: 0,
          qty_on_hand: 0,
          qty_available: 0,
          qty_in_transit: 0,
          qty_locked: 0,
          qty_reserved: 0,
          qty_damaged: 0,
        },
        warehouses: [],
        rows: [],
        total: 0,
      });
    });

    it("sends normalized stock filters and pagination", async () => {
      stubFetchJson({});
      const client = new ApiClient("https://api.example.test");
      await client.fetchWorkspaceInventoryStock("workspace-1", {
        search: "  SKU 001 ",
        warehouseNo: " WH-01 ",
        page: 2.8,
        pageSize: 500,
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const [, init] = fetchMock.mock.calls[0] ?? [];
      expect(JSON.parse(String(init?.body))).toEqual({
        search: "SKU 001",
        warehouse_no: "WH-01",
        page: 2,
        page_size: 100,
      });
    });
  });

  describe("fetchWorkspaceInventoryMonitor", () => {
    it("falls back to a safe empty monitor response when the body is null", async () => {
      stubFetchJson(null);
      const client = new ApiClient("https://api.example.test");
      const result = await client.fetchWorkspaceInventoryMonitor("workspace-1");

      expect(result.rows).toEqual([]);
      expect(result.categories).toEqual([]);
      expect(result.meta.turnover_window_days).toBe(3);
      expect(result.summary.overall_turnover_days).toBeNull();
    });

    it("normalizes monitor filters before sending them", async () => {
      stubFetchJson({});
      const client = new ApiClient("https://api.example.test");
      await client.fetchWorkspaceInventoryMonitor("workspace-1", {
        search: "  3.0244 ",
        category: " 黑巧系列 ",
        series: " 日常款 ",
        warehouseNo: " z1092 ",
        turnoverStatus: "warning",
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const [, init] = fetchMock.mock.calls[0] ?? [];
      expect(JSON.parse(String(init?.body))).toEqual({
        search: "3.0244",
        category: "黑巧系列",
        series: "日常款",
        warehouse_no: "z1092",
        turnover_status: "warning",
      });
    });

    it("normalizes monitor export filters before sending them", async () => {
      stubFetchJson("csv");
      const client = new ApiClient("https://api.example.test");
      await client.exportWorkspaceInventoryMonitor("workspace-1", {
        search: "  3.0244 ",
        category: " 黑巧系列 ",
        series: " 日常款 ",
        warehouseNo: " z1092 ",
        turnoverStatus: "warning",
      });

      const fetchMock = vi.mocked(globalThis.fetch);
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toBe("https://api.example.test/api/workspaces/workspace-1/inventory/monitor/export");
      expect(JSON.parse(String(init?.body))).toEqual({
        search: "3.0244",
        category: "黑巧系列",
        series: "日常款",
        warehouse_no: "z1092",
        turnover_status: "warning",
      });
    });
  });
});

// ── Agent table data schema tests ──

import {
  AgentTableDataResponseSchema,
  AgentTableSaveResponseSchema,
  EMPTY_AGENT_TABLE_DATA,
  EMPTY_AGENT_TABLE_SAVE,
  InventoryConfigResponseSchema,
  EMPTY_INVENTORY_CONFIG,
  InventoryDashboardResponseSchema,
  EMPTY_INVENTORY_DASHBOARD,
  InventoryStockResponseSchema,
  EMPTY_INVENTORY_STOCK,
  InventoryMonitorResponseSchema,
  EMPTY_INVENTORY_MONITOR,
  InventorySalesTrendResponseSchema,
  EMPTY_INVENTORY_SALES_TREND,
  ProductCategoryListResponseSchema,
  EMPTY_PRODUCT_CATEGORY_LIST,
  ProductCategoryUpdateResponseSchema,
  EMPTY_PRODUCT_CATEGORY_UPDATE,
} from "./schemas";

describe("AgentTableDataResponseSchema", () => {
  const opts = { endpoint: "TEST /unit" };

  it("accepts a valid response with rows and total", () => {
    const data = { rows: [{ id: 1, name: "test" }], total: 1 };
    const out = parseWithFallback(data, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect(out.rows).toEqual([{ id: 1, name: "test" }]);
    expect(out.total).toBe(1);
  });

  it("defaults rows to empty array when missing", () => {
    const out = parseWithFallback({ total: 50 }, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(50);
  });

  it("defaults total to 0 when missing", () => {
    const out = parseWithFallback({ rows: [{ x: 1 }] }, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect(out.rows).toEqual([{ x: 1 }]);
    expect(out.total).toBe(0);
  });

  it("falls back to EMPTY when data is null", () => {
    const out = parseWithFallback(null, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
  });

  it("falls back to EMPTY when rows is null — schema rejects null array", () => {
    // zod .array() rejects null (only .default() handles undefined).
    // The Go server normalises nil Rows to [] before JSON serialisation,
    // so this path is a defence against a future server regression.
    const out = parseWithFallback({ rows: null, total: 100 }, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect(out).toBe(EMPTY_AGENT_TABLE_DATA);
  });

  it("falls back when total is a string instead of number", () => {
    const out = parseWithFallback({ rows: [], total: "not-a-number" }, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect(out).toBe(EMPTY_AGENT_TABLE_DATA);
  });

  it("preserves unknown top-level fields (loose)", () => {
    const data = { rows: [{ a: 1 }], total: 1, future_field: { nested: true } };
    const out = parseWithFallback(data, AgentTableDataResponseSchema, EMPTY_AGENT_TABLE_DATA, opts);
    expect((out as Record<string, unknown>).future_field).toEqual({ nested: true });
  });
});

describe("AgentTableSaveResponseSchema", () => {
  const opts = { endpoint: "TEST /unit" };

  it("accepts a successful save response", () => {
    const data = { success: true, row: { id: "1", name: "updated" } };
    const out = parseWithFallback(data, AgentTableSaveResponseSchema, EMPTY_AGENT_TABLE_SAVE, opts);
    expect(out.success).toBe(true);
    expect(out.row).toEqual({ id: "1", name: "updated" });
  });

  it("accepts a failed save response with error message", () => {
    const data = { success: false, error: "column not found" };
    const out = parseWithFallback(data, AgentTableSaveResponseSchema, EMPTY_AGENT_TABLE_SAVE, opts);
    expect(out.success).toBe(false);
    expect(out.error).toBe("column not found");
  });

  it("defaults success to false when missing", () => {
    const out = parseWithFallback({}, AgentTableSaveResponseSchema, EMPTY_AGENT_TABLE_SAVE, opts);
    expect(out.success).toBe(false);
  });

  it("falls back when data is null", () => {
    const out = parseWithFallback(null, AgentTableSaveResponseSchema, EMPTY_AGENT_TABLE_SAVE, opts);
    expect(out).toBe(EMPTY_AGENT_TABLE_SAVE);
  });
});

describe("InventoryConfigResponseSchema", () => {
  const opts = { endpoint: "TEST /inventory/config" };

  it("fails closed when the response is null", () => {
    const parsed = parseWithFallback(
      null,
      InventoryConfigResponseSchema,
      EMPTY_INVENTORY_CONFIG,
      opts,
    );

    expect(parsed).toBe(EMPTY_INVENTORY_CONFIG);
    expect(parsed).toMatchObject({
      inventory_available: false,
      sales_trend_available: false,
      allocation_available: false,
      inventory_reason: "invalid_response",
      sales_trend_reason: "invalid_response",
      allocation_reason: "invalid_response",
      monitor_available: false,
      monitor_reason: "invalid_response",
    });
  });

  it("fails closed when a capability flag has the wrong type", () => {
    const parsed = parseWithFallback(
      {
        inventory_available: "yes",
        sales_trend_available: true,
        allocation_available: true,
      },
      InventoryConfigResponseSchema,
      EMPTY_INVENTORY_CONFIG,
      opts,
    );

    expect(parsed).toBe(EMPTY_INVENTORY_CONFIG);
    expect(parsed.inventory_available).toBe(false);
    expect(parsed.sales_trend_available).toBe(false);
    expect(parsed.allocation_available).toBe(false);
  });

  it("applies safe defaults to an incomplete but valid response", () => {
    const parsed = parseWithFallback(
      {},
      InventoryConfigResponseSchema,
      EMPTY_INVENTORY_CONFIG,
      opts,
    );

    expect(parsed).toEqual({
      inventory_available: false,
      inventory_reason: "",
      sales_trend_available: false,
      sales_trend_reason: "",
      allocation_available: false,
      allocation_reason: "",
      monitor_available: false,
      monitor_reason: "",
      latest_inventory_date: "",
      latest_inventory_updated_at: "",
      inventory_stale: false,
      latest_stat_date: "",
      refresh_interval_minutes: 60,
      read_only: true,
    });
  });

  it("preserves supported capability values and future fields", () => {
    const parsed = parseWithFallback(
      {
        inventory_available: true,
        sales_trend_available: true,
        allocation_available: false,
        latest_inventory_date: "2026-07-13",
        latest_inventory_updated_at: "2026-07-13T02:32:18Z",
        latest_stat_date: "2026-07-12",
        refresh_interval_minutes: 120,
        future_signal: "ready",
      },
      InventoryConfigResponseSchema,
      EMPTY_INVENTORY_CONFIG,
      opts,
    );

    expect(parsed).toMatchObject({
      inventory_available: true,
      sales_trend_available: true,
      allocation_available: false,
      latest_inventory_date: "2026-07-13",
      latest_inventory_updated_at: "2026-07-13T02:32:18Z",
      latest_stat_date: "2026-07-12",
      refresh_interval_minutes: 120,
      future_signal: "ready",
    });
  });
});

describe("ProductCategoryResponseSchemas", () => {
  const opts = { endpoint: "TEST /product-categories" };

  it("fails closed when the list contains a null rows array", () => {
    const parsed = parseWithFallback(
      { available: true, rows: null },
      ProductCategoryListResponseSchema,
      EMPTY_PRODUCT_CATEGORY_LIST,
      opts,
    );

    expect(parsed).toBe(EMPTY_PRODUCT_CATEGORY_LIST);
    expect(parsed.available).toBe(false);
    expect(parsed.rows).toEqual([]);
  });

  it("defaults an incomplete valid list without dropping future fields", () => {
    const parsed = parseWithFallback(
      { available: true, future_cursor: "next" },
      ProductCategoryListResponseSchema,
      EMPTY_PRODUCT_CATEGORY_LIST,
      opts,
    );

    expect(parsed).toMatchObject({
      available: true,
      rows: [],
      categories: [],
      series: [],
      page: 1,
      page_size: 30,
      future_cursor: "next",
    });
  });

  it("fails closed when an update response has a malformed row", () => {
    const parsed = parseWithFallback(
      { success: true, row: null, synced_records: 2 },
      ProductCategoryUpdateResponseSchema,
      EMPTY_PRODUCT_CATEGORY_UPDATE,
      opts,
    );

    expect(parsed).toBe(EMPTY_PRODUCT_CATEGORY_UPDATE);
    expect(parsed.success).toBe(false);
  });
});

describe("InventoryMonitorResponseSchema", () => {
  const opts = { endpoint: "TEST /inventory/monitor" };

  it("defaults an incomplete response to a safe empty monitor", () => {
    const parsed = parseWithFallback(
      {},
      InventoryMonitorResponseSchema,
      EMPTY_INVENTORY_MONITOR,
      opts,
    );

    expect(parsed).toEqual(EMPTY_INVENTORY_MONITOR);
  });

  it("accepts dynamic sales dates and nullable no-sales turnover", () => {
    const parsed = parseWithFallback(
      {
        meta: {
          sales_through_date: "2026-07-08",
          sales_dates: ["2026-07-06", "2026-07-07", "2026-07-08"],
          sales_months: [
            { month: "2026-02", through_date: "2026-02-28", partial: false },
            { month: "2026-07", through_date: "2026-07-08", partial: true },
          ],
          inventory_sources: [{
            source: "wdtqj.goods_spec_stocks",
            warehouse_no: "z1092",
            warehouse_name: "嘉兴菜鸟仓",
            warehouse_type: "cloud",
            snapshot_date: "2026-07-15",
            updated_at: "2026-07-15T01:42:32Z",
          }],
        },
        warehouses: [{
          warehouse_no: "z1092",
          warehouse_name: "嘉兴菜鸟仓",
          warehouse_type: "cloud",
        }],
        rows: [{
          material_code: "3.6522",
          material_name: "158g枣克力",
          monthly_sales: [
            { month: "2026-02", net_sales_qty: 372 },
            { month: "2026-07", net_sales_qty: 0 },
          ],
          daily_sales: [
            { date: "2026-07-06", net_sales_qty: 0 },
            { date: "2026-07-07", net_sales_qty: 0 },
            { date: "2026-07-08", net_sales_qty: 0 },
          ],
          turnover_days: null,
          turnover_status: "no_sales",
        }],
        summary: {
          monthly_sales: [
            { month: "2026-02", net_sales_qty: 372 },
            { month: "2026-07", net_sales_qty: 0 },
          ],
        },
        total: 1,
      },
      InventoryMonitorResponseSchema,
      EMPTY_INVENTORY_MONITOR,
      opts,
    );

    expect(parsed.meta.sales_dates).toHaveLength(3);
    expect(parsed.meta.sales_months).toEqual([
      { month: "2026-02", through_date: "2026-02-28", partial: false },
      { month: "2026-07", through_date: "2026-07-08", partial: true },
    ]);
    expect(parsed.warehouses[0]?.warehouse_name).toBe("嘉兴菜鸟仓");
    expect(parsed.rows[0]).toMatchObject({
      material_code: "3.6522",
      turnover_days: null,
      turnover_status: "no_sales",
      monthly_sales: [
        { month: "2026-02", net_sales_qty: 372 },
        { month: "2026-07", net_sales_qty: 0 },
      ],
    });
    expect(parsed.summary.monthly_sales[0]?.net_sales_qty).toBe(372);
  });

  it("fails safely when monthly sales collections are malformed", () => {
    const parsed = parseWithFallback(
      { meta: { sales_months: null } },
      InventoryMonitorResponseSchema,
      EMPTY_INVENTORY_MONITOR,
      opts,
    );

    expect(parsed).toBe(EMPTY_INVENTORY_MONITOR);
  });

  it("fails safely when turnover status drifts to an unsupported value", () => {
    const parsed = parseWithFallback(
      { rows: [{ turnover_status: "critical" }] },
      InventoryMonitorResponseSchema,
      EMPTY_INVENTORY_MONITOR,
      opts,
    );

    expect(parsed).toBe(EMPTY_INVENTORY_MONITOR);
  });
});

describe("InventoryStockResponseSchema", () => {
  const opts = { endpoint: "TEST /inventory/stock" };

  it("defaults an incomplete valid response to a safe empty stock view", () => {
    const parsed = parseWithFallback(
      {},
      InventoryStockResponseSchema,
      EMPTY_INVENTORY_STOCK,
      opts,
    );

    expect(parsed).toEqual(EMPTY_INVENTORY_STOCK);
  });

  it("preserves future fields while defaulting missing stock values", () => {
    const response = {
      snapshot_date: "2026-07-13",
      summary: { goods_count: 18, qty_available: 327_989 },
      warehouses: [{
        warehouse_no: "003",
        warehouse_name: "Lofi finished goods",
        future_signal: "active",
      }],
      rows: [{
        goods_no: "300001",
        goods_name: "Product A",
        warehouse_no: "003",
        qty_available: 42,
        future_signal: "fast-moving",
      }],
      total: 1,
    };

    const parsed = parseWithFallback(
      response,
      InventoryStockResponseSchema,
      EMPTY_INVENTORY_STOCK,
      opts,
    );
    expect(parsed.summary).toMatchObject({
      goods_count: 18,
      warehouse_count: 0,
      qty_available: 327_989,
    });
    expect(parsed.warehouses[0]).toMatchObject({
      warehouse_no: "003",
      warehouse_type: "",
      future_signal: "active",
    });
    expect(parsed.rows[0]).toMatchObject({
      goods_no: "300001",
      warehouse_name: "",
      batch_count: 0,
      qty_available: 42,
      future_signal: "fast-moving",
    });
  });

  it("falls back when a collection has the wrong type", () => {
    const malformed = {
      snapshot_date: "2026-07-13",
      summary: {},
      warehouses: [],
      rows: null,
      total: 1,
    };

    expect(parseWithFallback(
      malformed,
      InventoryStockResponseSchema,
      EMPTY_INVENTORY_STOCK,
      opts,
    )).toBe(EMPTY_INVENTORY_STOCK);
  });
});

describe("InventoryDashboardResponseSchema", () => {
  const opts = { endpoint: "TEST /inventory" };

  it("falls back safely for a null rows array", () => {
    const malformed = {
      batch: { id: "b1", batch_no: "B1", snapshot_at: "2026-07-11T00:00:00Z", delayed: false },
      metrics: {},
      rows: null,
      total: 1,
    };
    expect(parseWithFallback(malformed, InventoryDashboardResponseSchema, EMPTY_INVENTORY_DASHBOARD, opts))
      .toBe(EMPTY_INVENTORY_DASHBOARD);
  });

  it("keeps unknown recommendation fields while defaulting metrics", () => {
    const response = {
      batch: { id: "b1", batch_no: "B1", snapshot_at: "2026-07-11T00:00:00Z" },
      metrics: {},
      rows: [{ id: "r1", future_field: true }],
      total: 1,
    };
    const parsed = parseWithFallback(response, InventoryDashboardResponseSchema, EMPTY_INVENTORY_DASHBOARD, opts);
    expect(parsed.metrics.total_recommendations).toBe(0);
    expect(parsed.rows[0]).toMatchObject({ id: "r1", future_field: true });
  });
});

describe("InventorySalesTrendResponseSchema", () => {
  const opts = { endpoint: "TEST /inventory/sales-trend" };

  it("accepts unknown future fields and defaults optional values", () => {
    const response = {
      mode: "comparison",
      latest_stat_date: "2026-07-11",
      summary: {},
      points: [{
        stat_date: "2026-07-11",
        series_key: "WH-01",
        future_signal: "promotion",
      }],
    };
    const parsed = parseWithFallback(response, InventorySalesTrendResponseSchema, EMPTY_INVENTORY_SALES_TREND, opts);
    expect(parsed.points[0]).toMatchObject({ series_key: "WH-01", net_sales_qty: 0, future_signal: "promotion" });
  });

  it("falls back when points is null", () => {
    const malformed = { mode: "overall", latest_stat_date: "2026-07-11", summary: {}, points: null };
    expect(parseWithFallback(malformed, InventorySalesTrendResponseSchema, EMPTY_INVENTORY_SALES_TREND, opts))
      .toBe(EMPTY_INVENTORY_SALES_TREND);
  });
});

// Direct tests for the helper, decoupled from any specific endpoint —
// guards against an endpoint refactor masking a regression in the helper.
describe("parseWithFallback", () => {
  const opts = { endpoint: "TEST /unit" };

  it("returns parsed data on success", () => {
    const schema = z.object({ id: z.string() });
    const out = parseWithFallback({ id: "x" }, schema, { id: "fallback" }, opts);
    expect(out).toEqual({ id: "x" });
  });

  it("returns the fallback when validation fails", () => {
    const schema = z.object({ id: z.string() });
    const fallback = { id: "fallback" };
    const out = parseWithFallback({ id: 123 }, schema, fallback, opts);
    expect(out).toBe(fallback);
  });

  it("returns the fallback when data is null", () => {
    const schema = z.object({ id: z.string() });
    const fallback = { id: "fallback" };
    const out = parseWithFallback(null, schema, fallback, opts);
    expect(out).toBe(fallback);
  });
});
