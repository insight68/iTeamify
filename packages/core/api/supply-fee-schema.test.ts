import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

function stubFetchJson(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supply fee API response contracts", () => {
  it("fails closed when capability collections are malformed", async () => {
    stubFetchJson({ available: true, providers: null });
    const client = new ApiClient("https://api.example.test");
    const response = await client.fetchWorkspaceSupplyFeeConfig("ws-1");
    expect(response.available).toBe(false);
    expect(response.reason).toBe("invalid_response");
    expect(response.providers).toEqual([]);
  });

  it("accepts unknown future statuses without dropping the dashboard", async () => {
    stubFetchJson({
      latest_run_no: "SFR-20260718-01",
      metrics: { result_count: 1 },
      top_exceptions: [{ result_id: "10", line_id: "11", result_status: "under_review" }],
    });
    const client = new ApiClient("https://api.example.test");
    const response = await client.fetchWorkspaceSupplyFeeDashboard("ws-1");
    expect(response.latest_run_no).toBe("SFR-20260718-01");
    expect(response.top_exceptions[0]?.result_status).toBe("under_review");
    expect(response.metrics.billed_amount).toBe(0);
  });

  it("falls back when a result row changes identifier type", async () => {
    stubFetchJson({ rows: [{ result_id: 10, line_id: "11" }], total: 1, page: 1 });
    const client = new ApiClient("https://api.example.test");
    const response = await client.searchWorkspaceSupplyFeeResults("ws-1");
    expect(response).toEqual({ rows: [], total: 0, page: 1 });
  });

  it("falls back when result evidence is not a record", async () => {
    stubFetchJson({
      result: { id: "10" },
      lines: [],
      evidence: [{ line_id: "11", raw_bill: "raw", formula: {} }],
    });
    const client = new ApiClient("https://api.example.test");
    const response = await client.fetchWorkspaceSupplyFeeResult("ws-1", "10");
    expect(response.result.id).toBe("");
    expect(response.result.reason_code).toBe("invalid_response");
  });

  it("fails closed when bill batch rows change identifier type", async () => {
    stubFetchJson({ rows: [{ id: 42, status: "validated" }], total: 1, page: 1 });
    const client = new ApiClient("https://api.example.test");
    const response = await client.fetchWorkspaceSupplyFeeBills("ws-1");
    expect(response).toEqual({ rows: [], total: 0, page: 1 });
  });

  it("fails closed when bill validation errors are not an array", async () => {
    stubFetchJson({
      batch: { id: "42" },
      invalid_lines: [{ line_no: 2, validation_errors: null }],
    });
    const client = new ApiClient("https://api.example.test");
    const response = await client.fetchWorkspaceSupplyFeeBill("ws-1", "42");
    expect(response.batch.id).toBe("");
    expect(response.batch.status).toBe("invalid_response");
  });

  it("fails closed when a reconciliation run id is malformed", async () => {
    stubFetchJson({ id: 42, status: "queued" });
    const client = new ApiClient("https://api.example.test");
    const response = await client.runWorkspaceSupplyFeeReconciliation("ws-1", "42");
    expect(response.id).toBe("");
    expect(response.status).toBe("invalid_response");
  });
});
