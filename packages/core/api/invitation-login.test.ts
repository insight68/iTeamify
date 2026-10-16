import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("invitation login context", () => {
  it("reads the invitee email without attaching an existing session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ email: "invitee@example.test" }))));
    const client = new ApiClient("https://api.example.test");
    client.setToken("existing-token");
    await expect(client.getInvitationLoginContext("invitation-id")).resolves.toEqual({ email: "invitee@example.test" });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://api.example.test/auth/invitations/invitation-id");
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it.each([null, {}, { email: null }, { email: "invalid" }])("rejects a malformed context: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(new ApiClient("https://api.example.test").getInvitationLoginContext("id")).rejects.toThrow("Invalid invitation response");
  });
});
