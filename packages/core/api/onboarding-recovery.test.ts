import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
afterEach(() => vi.unstubAllGlobals());
it("fails closed on malformed task recovery data instead of treating it as an empty workspace", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ issues: "unreadable", total: 0 }))));
  await expect(new ApiClient("https://example.test").listIssues({}, { strict: true })).rejects.toMatchObject({ status: 502 });
});
