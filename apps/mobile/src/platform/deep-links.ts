import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Initialize deep link listener.
 * Returns a cleanup function.
 *
 * Supported patterns:
 *   teamify://invite/<id>           → navigate to /invite/:id
 *   teamify://auth?token=...        → loginWithToken callback
 *   https://teamify.world/...       → Universal Link / App Link
 */
export function initDeepLinks(
  onAuthToken: (token: string) => void,
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listener = App.addListener("appUrlOpen", (event) => {
    const url = new URL(event.url);
    const path = url.pathname;

    // Custom scheme: teamify://invite/<id>
    if (url.protocol === "teamify:") {
      if (path.startsWith("/auth")) {
        const token = url.searchParams.get("token");
        if (token) onAuthToken(token);
      }
      // Other teamify:// deep links are handled by router after navigation
    }

    // Universal Links / App Links: https://teamify.world/...
    // These are handled natively by the router via browser history
  });

  return () => {
    listener.then((l) => l.remove()).catch(() => {});
  };
}
