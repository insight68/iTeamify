import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
afterEach(() => vi.unstubAllGlobals());
it("rejects malformed profile acknowledgements instead of clearing user data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "missing id" }), { status: 200 })));
  await expect(new ApiClient("http://localhost").updateMe({ name: "Edited" })).rejects.toMatchObject({ status: 502 });
});
