/**
 * Realtime provider — Layer 2 of the realtime stack.
 *
 * Owns the WSClient instance, decides when it should be connected, and
 * exposes it via context to Layer 3 hooks (use-inbox-realtime, etc).
 *
 * Mounted INSIDE the workspace layout (app/(app)/[workspace]/_layout.tsx)
 * so by the time it runs we already have:
 *   - an authenticated user (auth-store.user is non-null)
 *   - a workspace slug + id (workspace-store, validated against
 *     workspace list)
 *
 * Workspace switch → unmount/remount → fresh client with the new slug.
 *
 * Lifecycle signals:
 *   AppState 'background'  → pause socket (iOS will kill it anyway; clean
 *                            close avoids a kernel-level reset on resume)
 *   AppState 'active'      → resume socket
 *   AppState 'inactive'    → ignore (transient: app switcher / Control
 *                            Center / incoming call — tearing down here
 *                            causes spurious reconnect storms)
 *   NetInfo offline → pause; online + foreground → connect once.
 *   Application heartbeat detects half-open sockets after network handoff.
 *
 * Provider does NOT register business event handlers — those live in
 * per-feature hooks (use-inbox-realtime, etc.) so the realtime layer
 * scales without one giant 700-line file like web's use-realtime-sync.
 */
import {
  createContext,
  use,
  useEffect,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { getToken } from "@/data/secure-storage";
import { WSClient } from "./ws-client";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  // ApiClient already throws on this; keeping a defensive check here
  // avoids a confusing "URL constructor failed" deep in WSClient.
  throw new Error("EXPO_PUBLIC_API_URL is not set");
}

// http(s)://host → ws(s)://host/ws
const WS_URL = `${API_URL.replace(/^http/, "ws")}/ws`;

const RealtimeContext = createContext<WSClient | null>(null);

/** Subscribe to the realtime WebSocket. Returns null while disconnected
 *  (cold start, between workspace switches, signed out). Consumers must
 *  guard with `if (!ws) return` in their effect. */
export function useWSClient(): WSClient | null {
  return use(RealtimeContext);
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const [client, setClient] = useState<WSClient | null>(null);

  useEffect(() => {
    if (!userId || !wsSlug) {
      setClient(null);
      return;
    }
    let cancelled = false;
    let ws: WSClient | null = null;
    let foreground = AppState.currentState !== "background";
    let online = false;
    const syncConnection = () => {
      if (cancelled) return;
      if (foreground && online) ws?.connect();
      else ws?.pause();
    };
    const appStateSub = AppState.addEventListener("change", (status) => {
      if (status === "inactive") return;
      foreground = status === "active";
      syncConnection();
    });
    const netInfoUnsub = NetInfo.addEventListener((state) => {
      online = state.isConnected === true && state.isInternetReachable !== false;
      syncConnection();
    });
    // Tear down synchronously on account/workspace changes. React effect
    // cleanup can run later; old events must not repopulate a cleared cache.
    const invalidate = () => { cancelled = true; ws?.disconnect(); };
    const authUnsub = useAuthStore.subscribe((state) => {
      if (state.user?.id !== userId) invalidate();
    });
    const workspaceUnsub = useWorkspaceStore.subscribe((state) => {
      if (state.currentWorkspaceSlug !== wsSlug) invalidate();
    });
    void getToken().then((token) => {
      if (cancelled || !token) return;
      ws = new WSClient({ url: WS_URL, token, workspaceSlug: wsSlug, clientVersion: "0.1.0", clientOS: Platform.OS === "android" ? "android" : "ios", logger: console });
      setClient(ws);
      syncConnection();
    }).catch(() => {
      if (!cancelled) console.warn("[ws] could not read credentials");
    });
    return () => {
      invalidate();
      appStateSub.remove();
      netInfoUnsub();
      authUnsub();
      workspaceUnsub();
      setClient(null);
    };
  }, [userId, wsSlug]);

  return (
    <RealtimeContext.Provider value={client}>
      {children}
    </RealtimeContext.Provider>
  );
}
