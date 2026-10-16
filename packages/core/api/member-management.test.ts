import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("member management API contracts", () => {
  it.each([
    null,
    {},
    { role: "admin" },
    { id: "", user_id: "user", workspace_id: "workspace", role: "admin" },
    { id: "membership", user_id: "user", workspace_id: "workspace" },
    { id: "membership", user_id: "user", workspace_id: "workspace", role: "unexpected" },
  ])("rejects a malformed role-change receipt %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(new ApiClient("https://example.test").updateMember("workspace", "membership", { role: "admin" })).rejects.toThrow("Invalid member response");
  });
  it("keeps the member identity and normalizes optional profile fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "membership", user_id: "user", workspace_id: "workspace", role: "admin" }))));
    const client = new ApiClient("https://example.test");
    await expect(client.updateMember("workspace", "membership", { role: "admin" })).resolves.toMatchObject({ id: "membership", user_id: "user", role: "admin", avatar_url: null });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://example.test/api/workspaces/workspace/members/membership");
  });
  it.each([null, {}, [{ id: "invitation" }]])("rejects a malformed invitation list %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(new ApiClient("https://example.test").listWorkspaceInvitations("workspace")).rejects.toThrow("Invalid invitations response");
  });
  it("rejects a malformed invitation creation receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(new ApiClient("https://example.test").createMember("workspace", { email: "person@example.test", role: "member" })).rejects.toThrow("Invalid invitation response");
  });
});
