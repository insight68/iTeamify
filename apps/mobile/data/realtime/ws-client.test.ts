import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WSClient } from "./ws-client";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  send(frame: string) {
    this.sent.push(frame);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

function connectAuthenticatedClient() {
  const client = new WSClient({
    url: "wss://example.test/ws",
    token: "token",
    workspaceSlug: "workspace",
  });
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "auth_ack" });
  return { client, socket };
}

describe("WSClient application heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("identifies Android connections without depending on the native bridge", () => {
    const client = new WSClient({ url: "wss://example.test/ws", token: "token", workspaceSlug: "workspace", clientOS: "android" });
    client.connect();
    expect(new URL(MockWebSocket.instances[0].url).searchParams.get("client_os")).toBe("android");
    client.disconnect();
  });

  it("reconnects a stale OPEN socket through the jittered backoff path", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, socket } = connectAuthenticatedClient();

    expect(socket.sent.map((frame) => JSON.parse(frame))).toEqual([
      { type: "auth", payload: { token: "token" } },
      { type: "ping" },
    ]);

    // No pong arrives even though the JS-visible readyState remains OPEN.
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(1);

    expect(MockWebSocket.instances).toHaveLength(2);
    client.disconnect();
  });

  it("keeps a healthy socket connected when its pong arrives", () => {
    const { client, socket } = connectAuthenticatedClient();
    socket.receive({ type: "pong" });

    vi.advanceTimersByTime(10_000);

    expect(MockWebSocket.instances).toHaveLength(1);
    client.disconnect();
  });

  it("pauses all timers in the background and reconnects only once on repeated foreground signals", () => {
    const { client, socket } = connectAuthenticatedClient();
    const reconnect = vi.fn();
    client.onReconnect(reconnect);
    client.pause();
    vi.advanceTimersByTime(120_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    client.connect();
    client.connect();
    client.resume();
    expect(MockWebSocket.instances).toHaveLength(2);
    const next = MockWebSocket.instances[1];
    next.open();
    next.receive({ type: "auth_ack" });
    expect(reconnect).toHaveBeenCalledOnce();
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    client.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a native bridge frame queued by a retired socket", () => {
    const { client, socket } = connectAuthenticatedClient();
    const lateFrame = socket.onmessage!;
    const handler = vi.fn();
    client.onAny(handler);
    client.disconnect();
    client.connect();
    lateFrame({ data: JSON.stringify({ type: "chat:done", payload: {} }) });
    expect(handler).not.toHaveBeenCalled();
    client.disconnect();
  });
});
