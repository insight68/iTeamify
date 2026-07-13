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
});

// ── Agent table data schema tests ──

import {
  AgentTableDataResponseSchema,
  AgentTableSaveResponseSchema,
  EMPTY_AGENT_TABLE_DATA,
  EMPTY_AGENT_TABLE_SAVE,
  InventoryDashboardResponseSchema,
  EMPTY_INVENTORY_DASHBOARD,
  InventorySalesTrendResponseSchema,
  EMPTY_INVENTORY_SALES_TREND,
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
