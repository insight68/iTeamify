import type { WSMessage, WSEventPayloadMap, WSEventType } from "../types/events";
import { type Logger, noopLogger } from "../logger";
import { parseWSFrame } from "./ws-schema";

type EventHandler = (payload: unknown, actorId?: string) => void;

/** Identifies the WS client to the server. Sent as `client_platform`,
 *  `client_version`, and `client_os` query parameters on the upgrade URL —
 *  browsers cannot set custom headers on WebSocket handshakes, so query
 *  params are the only portable channel. */
export interface WSClientIdentity {
  platform?: string;
  version?: string;
  os?: string;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private token: string | null = null;
  private workspaceSlug: string | null = null;
  private cookieAuth = false;
  private identity: WSClientIdentity | undefined;
  private handlers = new Map<WSEventType, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private hasConnectedBefore = false;
  private onReconnectCallbacks = new Set<() => void>();
  private anyHandlers = new Set<(msg: WSMessage) => void>();
  private logger: Logger;
  private retryCount = 0;
  private static readonly MAX_RETRIES = 50;
  private static readonly BASE_DELAY_MS = 1000;
  private static readonly MAX_DELAY_MS = 30000;

  constructor(
    url: string,
    options?: {
      logger?: Logger;
      cookieAuth?: boolean;
      identity?: WSClientIdentity;
    },
  ) {
    this.baseUrl = url;
    this.logger = options?.logger ?? noopLogger;
    this.cookieAuth = options?.cookieAuth ?? false;
    this.identity = options?.identity;
  }

  setAuth(token: string | null, workspaceSlug: string) {
    this.token = token;
    this.workspaceSlug = workspaceSlug;
  }

  connect() {
    const url = new URL(this.baseUrl);
    // Token is never sent as a URL query parameter — it would be logged by
    // proxies, CDNs, and browser history.  In cookie mode the HttpOnly cookie
    // is sent automatically with the upgrade request.  In token mode the token
    // is delivered as the first WebSocket message after the connection opens.
    if (this.workspaceSlug)
      url.searchParams.set("workspace_slug", this.workspaceSlug);
    if (this.identity?.platform)
      url.searchParams.set("client_platform", this.identity.platform);
    if (this.identity?.version)
      url.searchParams.set("client_version", this.identity.version);
    if (this.identity?.os)
      url.searchParams.set("client_os", this.identity.os);

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      if (!this.cookieAuth && this.token) {
        this.ws!.send(
          JSON.stringify({ type: "auth", payload: { token: this.token } }),
        );
        return;
      }

      this.onAuthenticated();
    };

    this.ws.onmessage = (event) => {
      const parsed = parseWSFrame(event.data);
      if (!parsed) {
        this.logger.warn("ws ignored malformed or unknown message");
        return;
      }
      if (parsed.kind === "auth_ack") {
        this.onAuthenticated();
        return;
      }
      const msg = parsed.message;
      this.logger.debug("received", msg.type);
      const eventHandlers = this.handlers.get(msg.type);
      if (eventHandlers) {
        for (const handler of eventHandlers) {
          try {
            handler(msg.payload, msg.actor_id);
          } catch (error) {
            this.logger.warn("ws event handler failed", msg.type, error);
          }
        }
      }
      for (const handler of this.anyHandlers) {
        try {
          handler(msg);
        } catch (error) {
          this.logger.warn("ws wildcard handler failed", msg.type, error);
        }
      }
    };

    this.ws.onclose = (ev: CloseEvent) => {
      this.retryCount++;
      if (this.retryCount > WSClient.MAX_RETRIES) {
        this.logger.warn(
          `ws disconnected (code=${ev.code} reason=${ev.reason || "<empty>"}), max retries (${WSClient.MAX_RETRIES}) exceeded — giving up`,
        );
        return;
      }
      const delay = this.nextBackoffDelay();
      this.logger.warn(
        `ws disconnected (code=${ev.code} reason=${ev.reason || "<empty>"}), reconnecting in ${Math.round(delay)}ms (attempt ${this.retryCount}/${WSClient.MAX_RETRIES})`,
      );
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };

    this.ws.onerror = (ev: Event) => {
      this.logger.warn("ws error", ev.type);
    };
  }

  /** Exponential backoff with jitter: base 1s → max 30s. */
  private nextBackoffDelay(): number {
    const exp = WSClient.BASE_DELAY_MS * Math.pow(2, this.retryCount - 1);
    const capped = Math.min(exp, WSClient.MAX_DELAY_MS);
    // Full jitter — randomise within [0, capped] to spread thundering herds.
    return Math.random() * capped;
  }

  private onAuthenticated() {
    this.retryCount = 0;
    this.logger.info("connected");
    if (this.hasConnectedBefore) {
      for (const cb of this.onReconnectCallbacks) {
        try {
          cb();
        } catch {
          // ignore reconnect callback errors
        }
      }
    }
    this.hasConnectedBefore = true;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Remove handlers before close to prevent onclose from scheduling a reconnect
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.hasConnectedBefore = false;
    this.retryCount = 0;
    this.handlers.clear();
    this.anyHandlers.clear();
    this.onReconnectCallbacks.clear();
  }

  on<K extends keyof WSEventPayloadMap>(
    event: K,
    handler: (payload: WSEventPayloadMap[K], actorId?: string) => void,
  ) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const untypedHandler: EventHandler = (payload, actorId) =>
      handler(payload as WSEventPayloadMap[K], actorId);
    this.handlers.get(event)!.add(untypedHandler);
    return () => {
      this.handlers.get(event)?.delete(untypedHandler);
    };
  }

  onUntyped(event: WSEventType, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  onAny(handler: (msg: WSMessage) => void) {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  onReconnect(callback: () => void) {
    this.onReconnectCallbacks.add(callback);
    return () => {
      this.onReconnectCallbacks.delete(callback);
    };
  }

  send(message: WSMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
