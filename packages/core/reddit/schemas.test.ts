import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClient } from "../api/client";
import { parseWithFallback } from "../api/schema";
import {
  redditConnectionsSchema,
  redditDraftListSchema,
  redditAuthorizationSchema,
  redditPageSchema,
  emptyRedditPage,
} from "./schemas";

afterEach(() => vi.unstubAllGlobals());
describe("Reddit API boundaries", () => {
  it("degrades malformed collections without granting permissions", () => {
    expect(
      parseWithFallback(
        { configured: true, connections: [{ id: "wrong", can_reply: "true" }] },
        redditConnectionsSchema,
        { configured: false, connections: [] },
        { endpoint: "test", redactReceived: true },
      ),
    ).toEqual({ configured: false, connections: [] });
    expect(
      parseWithFallback([{ status: "sent" }], redditDraftListSchema, [], {
        endpoint: "test",
        redactReceived: true,
      }),
    ).toEqual([]);
    expect(
      parseWithFallback({ items: null }, redditPageSchema, emptyRedditPage, {
        endpoint: "test",
        redactReceived: true,
      }).partial,
    ).toBe(true);
  });
  it("rejects OAuth redirects outside Reddit", () => {
    for (const url of [
      "https://evil.test/api/v1/authorize",
      "javascript:alert(1)",
      "https://www.reddit.com.evil.test/api/v1/authorize",
    ])
      expect(redditAuthorizationSchema.safeParse({ url }).success).toBe(false);
    expect(
      redditAuthorizationSchema.safeParse({
        url: "https://www.reddit.com/api/v1/authorize?state=test",
      }).success,
    ).toBe(true);
  });
  it("fails closed on a malformed approval receipt and stamps the workspace", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "sent" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const client = new ApiClient("https://app.test");
    await expect(
      client.redditDraftAction("workspace-a", "draft", "approve", 3),
    ).rejects.toThrow("reddit_invalid_response");
    const [path, options] = fetcher.mock.calls[0]!;
    expect(path).toContain("/api/reddit/drafts/draft/approve");
    expect(new Headers(options.headers).get("X-Workspace-ID")).toBe(
      "workspace-a",
    );
    expect(JSON.parse(options.body).expected_version).toBe(3);
  });
});
