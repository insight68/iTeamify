import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

const workspace = vi.hoisted(() => ({ slug: "one", version: 0 }));
vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = "https://mobile.test"; });
vi.mock("./workspace-store", () => ({
  getCurrentSlug: () => workspace.slug,
  getWorkspaceVersion: () => workspace.version,
}));
import { api } from "./api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const user = { id: "user-a", email: "a@example.test", name: "A" };

describe("mobile request ownership", () => {
  const unauthorized = vi.fn();
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    unauthorized.mockClear();
    api.setToken(null);
    api.setToken("account-a");
    api.setOptions({ onUnauthorized: unauthorized });
    workspace.slug = "one";
    workspace.version++;
  });
  afterEach(() => {
    api.setToken(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([200, 401])("discards account A's late HTTP %s after signing in as B", async (status) => {
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetcher);
    const request = api.getMe();
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    api.setToken("account-b");
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    response.resolve(Response.json(user, { status }));
    await rejected;
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("identifies Android requests to the server", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(user));
    vi.stubGlobal("fetch", fetcher);
    await api.getMe();
    expect(fetcher.mock.calls[0][1].headers["X-Client-OS"]).toBe("android");
  });

  it("checks ownership again after reading a delayed response body", async () => {
    const body = deferred<unknown>();
    const json = vi.fn().mockReturnValue(body.promise);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));
    const request = api.getMe();
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(json).toHaveBeenCalled());
    api.setToken("account-b");
    body.resolve(user);
    await rejected;
  });

  it("rejects responses across an A to B to A workspace transition", async () => {
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response.promise));
    const request = api.getMe();
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    workspace.version += 2;
    response.resolve(Response.json(user));
    await rejected;
  });

  it("handles a current authenticated 401 but does not log out for a bad login code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Unauthorized" }, { status: 401 })));
    await expect(api.getMe()).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledOnce();
    api.setToken(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 401 })));
    await expect(api.verifyCode("a@example.test", "000000")).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("keeps the timeout active while the response body is streaming", async () => {
    vi.useFakeTimers();
    const body = deferred<unknown>();
    const json = vi.fn().mockReturnValue(body.promise);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));
    const request = api.getMe();
    const rejected = expect(request).rejects.toMatchObject({ status: 0 });
    await Promise.resolve();
    expect(json).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    body.resolve(user);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends both cursor fields when fetching older chat messages", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ messages: [], has_more: false, limit: 50 }));
    vi.stubGlobal("fetch", fetcher);
    await api.listChatMessagesPage("chat", { id: "message", created_at: "2026-09-07T01:00:00Z" });
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("before_id")).toBe("message");
    expect(url.searchParams.get("before_created_at")).toBe("2026-09-07T01:00:00Z");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("uses native multipart boundaries and rejects a late upload across accounts", async () => {
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetcher);
    const request = api.uploadFile({ uri: "file:///image.png", name: "image.png", type: "image/png" });
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer account-a");
    api.setToken("account-b");
    response.resolve(Response.json({ id: "attachment", url: "/image.png", filename: "image.png" }));
    await rejected;
  });
});
