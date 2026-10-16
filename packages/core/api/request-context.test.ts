import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiClient } from "./client";
import { setApiInstance } from "./index";
import { issueDetailOptions, issueKeys } from "../issues/queries";
import { setCurrentWorkspace } from "../platform/workspace-storage";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setCurrentWorkspace(null, null);
});

describe("request lifetime", () => {
  it("cancels the transport when Query cancels a detail, without warming a list", async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    setApiInstance(new ApiClient("https://api.example.test"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending = qc.fetchQuery(issueDetailOptions("ws-a", "issue-1")).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1];
    expect(init.headers).toMatchObject({ "X-Workspace-ID": "ws-a" });
    await qc.cancelQueries({ queryKey: issueKeys.detail("ws-a", "issue-1") });
    await pending;
    expect(init.signal?.aborted).toBe(true);
    expect(qc.getQueryData(issueKeys.detail("ws-a", "issue-1"))).toBeUndefined();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/api/issues/issue-1");
    qc.clear();
  });

  it("keeps explicit scopes separate from the active workspace", async () => {
    setCurrentWorkspace("active", "ws-a");
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"issues":[],"total":0}')));
    vi.stubGlobal("fetch", fetchMock);
    const api = new ApiClient("https://api.example.test");
    await Promise.all([
      api.withRequestContext({ workspaceId: "ws-b" }).listIssues(),
      api.withRequestContext({ workspaceId: "ws-a" }).listIssues(),
    ]);
    expect(fetchMock.mock.calls.map((call) => call[1].headers["X-Workspace-ID"])).toEqual(["ws-b", "ws-a"]);
    expect(fetchMock.mock.calls.every((call) => call[1].headers["X-Workspace-Slug"] === undefined)).toBe(true);
  });

  it("retires an active-workspace request and ignores a late 401", async () => {
    setCurrentWorkspace("active", "ws-a");
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const onUnauthorized = vi.fn();
    const api = new ApiClient("https://api.example.test", { onUnauthorized });
    const pending = api.withRequestContext({ workspaceId: "ws-a" }).listIssues();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    setCurrentWorkspace("next", "ws-b");
    await rejected;
    resolve(new Response('{"error":"expired"}', { status: 401 }));
    await Promise.resolve();
    await Promise.resolve();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("shares auth retirement with request-bound clients", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const api = new ApiClient("https://api.example.test");
    api.setToken("user-a");
    const scoped = api.withRequestContext({ workspaceId: "ws-a" });
    const pending = scoped.listIssues();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    api.setToken("user-b");
    await rejected;
    await expect(scoped.listIssues()).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds a transport that never returns headers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const pending = new ApiClient("https://api.example.test", { requestTimeoutMs: 50 }).listIssues();
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the deadline active while a JSON body stalls", async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream({ start() {} }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const pending = new ApiClient("https://api.example.test", { requestTimeoutMs: 50 }).listIssues();
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps text and export body reads bounded", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({ start() {} })))));
    const api = new ApiClient("https://api.example.test", { requestTimeoutMs: 25, transferTimeoutMs: 50 });
    const text = expect(api.getAttachmentTextContent("a")).rejects.toMatchObject({ name: "TimeoutError" });
    const blob = expect(api.downloadContractReviewFile("f")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([text, blob]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry an uncertain write", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const rejected = expect(new ApiClient("https://api.example.test", { requestTimeoutMs: 50 }).createIssue({ title: "One" })).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cleans up an already cancelled request before contacting the server", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn());
    await expect(new ApiClient("https://api.example.test").withRequestContext({ signal: controller.signal }).listIssues()).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects malformed detail JSON instead of rendering a fabricated issue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"id":"issue-1","title":42}')));
    await expect(new ApiClient("https://api.example.test").getIssue("issue-1")).rejects.toMatchObject({ status: 502 });
  });
});
