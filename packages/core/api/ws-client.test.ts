import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WSClient } from "./ws-client";

// Capture URL passed to WebSocket so we can assert the connect-time
// query string.  We don't simulate the full WS lifecycle here — only the
// upgrade URL construction, which is what carries client identity.
class FakeWebSocket {
  static lastUrl: string | null = null;
  static lastInstance: FakeWebSocket | null = null;
  // Fields read by WSClient.connect()/disconnect(), all no-op here.
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: { type: string }) => void) | null = null;
  readyState = 0;
  constructor(url: string) {
    FakeWebSocket.lastUrl = url;
    FakeWebSocket.lastInstance = this;
  }
  close() {}
  send() {}
}

describe("WSClient", () => {
  beforeEach(() => {
    FakeWebSocket.lastUrl = null;
    FakeWebSocket.lastInstance = null;
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("includes client identity in the upgrade URL when configured", () => {
    const ws = new WSClient("ws://example.test/ws", {
      identity: { platform: "desktop", version: "1.2.3", os: "macos" },
    });
    ws.setAuth("tok", "acme");
    ws.connect();

    const url = new URL(FakeWebSocket.lastUrl!);
    expect(url.searchParams.get("workspace_slug")).toBe("acme");
    expect(url.searchParams.get("client_platform")).toBe("desktop");
    expect(url.searchParams.get("client_version")).toBe("1.2.3");
    expect(url.searchParams.get("client_os")).toBe("macos");
    // Token must never appear in the URL — it is delivered as the first
    // WS message in token mode.
    expect(url.searchParams.has("token")).toBe(false);
    ws.disconnect();
  });

  it("omits client_* params when identity is not configured", () => {
    const ws = new WSClient("ws://example.test/ws");
    ws.setAuth("tok", "acme");
    ws.connect();

    const url = new URL(FakeWebSocket.lastUrl!);
    expect(url.searchParams.has("client_platform")).toBe(false);
    expect(url.searchParams.has("client_version")).toBe(false);
    expect(url.searchParams.has("client_os")).toBe(false);
    ws.disconnect();
  });

  it("only includes the identity fields that are set", () => {
    const ws = new WSClient("ws://example.test/ws", {
      identity: { platform: "cli" },
    });
    ws.setAuth("tok", "acme");
    ws.connect();

    const url = new URL(FakeWebSocket.lastUrl!);
    expect(url.searchParams.get("client_platform")).toBe("cli");
    expect(url.searchParams.has("client_version")).toBe(false);
    expect(url.searchParams.has("client_os")).toBe(false);
    ws.disconnect();
  });

  it("reconnects after close with exponential backoff", () => {
    const logs: string[] = [];
    const ws = new WSClient("ws://example.test/ws", {
      cookieAuth: true,
      logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), debug: () => {}, error: () => {} },
    });
    ws.setAuth("tok", "acme");
    ws.connect();

    // Simulate successful open (cookie auth path → calls onAuthenticated)
    FakeWebSocket.lastInstance!.onopen!();
    expect(logs).toContain("connected");

    // Simulate close — triggers reconnect timer
    FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "" });

    // First retry: base delay is 1s, with jitter it's [0, 1000]
    // Advance timers to fire reconnect
    FakeWebSocket.lastUrl = null;
    vi.advanceTimersByTime(1500);
    expect(FakeWebSocket.lastUrl).not.toBeNull();

    ws.disconnect();
  });

  it("stops reconnecting after MAX_RETRIES", () => {
    const logs: string[] = [];
    const ws = new WSClient("ws://example.test/ws", {
      cookieAuth: true,
      logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), debug: () => {}, error: () => {} },
    });
    ws.setAuth("tok", "acme");
    ws.connect();

    // Initial connect creates instance. Close it to start retry cycle.
    FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "" });

    // Simulate 49 more close cycles (total 50 retries before exceeding limit).
    for (let i = 0; i < 49; i++) {
      vi.advanceTimersByTime(30000);
      FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "abnormal" });
    }

    // 50th close — retryCount reaches 51 > MAX_RETRIES(50), stops retrying
    vi.advanceTimersByTime(30000);
    FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "abnormal" });

    // After exceeding max retries, advancing timers should NOT create new WS
    const urlBefore = FakeWebSocket.lastUrl;
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.lastUrl).toBe(urlBefore);
    expect(logs.some((l) => l.includes("max retries"))).toBe(true);

    ws.disconnect();
  });

  it("resets retry count on successful connect", () => {
    const logs: string[] = [];
    const ws = new WSClient("ws://example.test/ws", {
      cookieAuth: true,
      logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), debug: () => {}, error: () => {} },
    });
    ws.setAuth("tok", "acme");
    ws.connect();

    // Close 5 times to build up retry count
    FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "" });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(30000);
      FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "" });
    }

    // Now successfully connect — should reset retryCount to 0
    vi.advanceTimersByTime(30000);
    FakeWebSocket.lastInstance!.onopen!();

    // Close again — retry count should be 1, not 6
    FakeWebSocket.lastInstance!.onclose!({ code: 1006, reason: "" });
    const lastWarn = logs.filter((l) => l.includes("attempt")).pop()!;
    expect(lastWarn).toContain("attempt 1/50");

    ws.disconnect();
  });

  it("ignores malformed frames and still dispatches the next valid frame", () => {
    const handler = vi.fn();
    const ws = new WSClient("ws://example.test/ws", { cookieAuth: true });
    ws.setAuth("tok", "acme");
    ws.connect();
    ws.on("issue:deleted", handler);

    FakeWebSocket.lastInstance!.onmessage!({ data: "{" });
    FakeWebSocket.lastInstance!.onmessage!({
      data: JSON.stringify({ type: "issue:deleted", payload: { issue_id: "issue-1" } }),
    });

    expect(handler).toHaveBeenCalledWith({ issue_id: "issue-1" }, undefined);
    ws.disconnect();
  });

  it("isolates a failing event handler from other subscribers", () => {
    const secondHandler = vi.fn();
    const ws = new WSClient("ws://example.test/ws", { cookieAuth: true });
    ws.setAuth("tok", "acme");
    ws.connect();
    ws.on("issue:deleted", () => { throw new Error("boom"); });
    ws.on("issue:deleted", secondHandler);

    FakeWebSocket.lastInstance!.onmessage!({
      data: JSON.stringify({ type: "issue:deleted", payload: { issue_id: "issue-1" } }),
    });

    expect(secondHandler).toHaveBeenCalledOnce();
    ws.disconnect();
  });
});
