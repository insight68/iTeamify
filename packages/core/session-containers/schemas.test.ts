import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionContainerSchema, contractReviewSchema } from "./schemas";
import { agentSessionSchema } from "../chat/schemas";
import { ApiClient } from "../api/client";
import { applicationsSchema } from "./application-schemas";
afterEach(() => vi.unstubAllGlobals());
describe("session container contracts", () => {
  it("retains unknown descriptors for the readonly fallback", () => {
    expect(sessionContainerSchema.parse({ type: "future_container" }).type).toBe("future_container");
  });
  it("normalizes legacy sessions to conversation", () => {
    const s = { id: "11111111-1111-4111-8111-111111111111", workspace_id: "22222222-2222-4222-8222-222222222222", agent_id: "33333333-3333-4333-8333-333333333333", creator_id: "44444444-4444-4444-8444-444444444444", title: "Chat", status: "active", created_at: "2026-10-11", updated_at: "2026-10-11" };
    expect(agentSessionSchema.parse(s).container.type).toBe("conversation");
    expect(agentSessionSchema.parse({ ...s, container: null }).container.type).toBe("conversation");
  });
  it("rejects a malformed review response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "submitted" }), { status: 201 })));
    await expect(new ApiClient("https://example.test").getContractReview("s")).rejects.toThrow();
    expect(contractReviewSchema.safeParse({ status: "submitted" }).success).toBe(false);
  });
  it("fails closed for a malformed application discovery response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ providers: [{ status: "enabled" }] }), { status: 200 })));
    await expect(new ApiClient("https://example.test").listSessionApplications()).rejects.toThrow();
    expect(applicationsSchema.parse({ applications: ["conversation", "contract_review"], can_manage: false, providers: null, configurations: null }).providers).toEqual([]);
  });
  it("rejects a malformed saved application receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "enabled" }), { status: 200 })));
    await expect(new ApiClient("https://example.test").saveSessionApplication({ target_kind: "member", target_id: "11111111-1111-4111-8111-111111111111", status: "enabled", version: 0, config: { service_name: "Review", description: "", contract_types: [], require_background: false, require_focus: false, default_priority: "normal", review_instructions: "", result_requirements: "", agent_instructions: "" } })).rejects.toThrow();
  });
});
