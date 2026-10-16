import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { createLogger } from "../logger";
import { workspaceOpenAgentTestErrorCode } from "../workspace/openagent";
const config = { configured: true, revision: 1, base_url: "https://provider.example.com", model: "model-a", credential_configured: true, updated_at: null };
afterEach(() => vi.unstubAllGlobals());
describe("workspace OpenAgent API boundaries", () => {
 it("uses the explicit workspace path and a schema-validated redacted response", async () => { const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(config), { status: 200 })); vi.stubGlobal("fetch", fetch); const client = new ApiClient("https://api.example.com"); await expect(client.getWorkspaceOpenAgentConfig("workspace-a")).resolves.toEqual(config); expect(fetch.mock.calls[0]?.[0]).toBe("https://api.example.com/api/workspaces/workspace-a/openagent/config"); });
 it.each(["get", "put", "test"])("rejects malformed %s responses", async operation => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ configured: "wrong", api_key: "must-not-be-used" }), { status: 200 }))); const client = new ApiClient("https://api.example.com"); const input = { expected_revision: 0, base_url: "https://provider.example.com", model: "model-a", api_key: "input-key" }; const result = operation === "get" ? client.getWorkspaceOpenAgentConfig("workspace-a") : operation === "put" ? client.updateWorkspaceOpenAgentConfig("workspace-a", input) : client.testWorkspaceOpenAgentConfig("workspace-a", input); await expect(result).rejects.toThrow(); });
});


describe("OpenAgent connection test outcomes", () => {
  const input = { expected_revision: 1, base_url: "https://provider.example.com/anthropic", model: "model-a" };
  it("preserves a classified negative result without console.error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "network_policy", error: "Provider DNS is not public", api_key: "must-not-be-carried" }), { status: 200 })));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = new ApiClient("https://api.example.com", { logger: createLogger("api") });
      const error = await client.testWorkspaceOpenAgentConfig("workspace-a", input).catch(error => error);
      expect(error).toMatchObject({ status: 422, message: "Provider DNS is not public", body: { ok: false, code: "network_policy" } });
      expect(workspaceOpenAgentTestErrorCode(error)).toBe("network_policy");
      expect(error.body).not.toHaveProperty("api_key");
      expect(consoleError).not.toHaveBeenCalled();
    } finally { consoleError.mockRestore(); }
  });
  it("continues to accept successful responses from earlier servers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(new ApiClient("https://api.example.com").testWorkspaceOpenAgentConfig("workspace-a", input)).resolves.toBeUndefined();
  });
  it.each([{ ok: false }, { ok: "false", code: "network_policy", error: "failed" }, { ok: false, code: "network_policy", error: null }])("rejects malformed test outcomes", async body => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(new ApiClient("https://api.example.com").testWorkspaceOpenAgentConfig("workspace-a", input)).rejects.toThrow("Invalid connection test response");
  });
  it("retains unknown failure codes for the generic UI fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "future_failure", error: "Connection failed", upstream_status: null }), { status: 200 })));
    const error = await new ApiClient("https://api.example.com").testWorkspaceOpenAgentConfig("workspace-a", input).catch(error => error);
    expect(workspaceOpenAgentTestErrorCode(error)).toBe("future_failure");
  });
});
