import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";

/**
 * Initialize push notification registration and listeners.
 * Returns a cleanup function.
 *
 * Requires backend: Push Token registration API endpoint.
 */
export function initPushNotifications(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listeners: Promise<{ remove: () => void }>[] = [];

  const init = async () => {
    const permResult = await PushNotifications.checkPermissions();
    if (permResult.receive === "prompt") {
      await PushNotifications.requestPermissions();
    }

    await PushNotifications.register();

    listeners.push(
      PushNotifications.addListener("registration", (token) => {
        // TODO: Send token to backend for this device/user
        console.info("Push registration token:", token.value);
      }),
    );

    listeners.push(
      PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error:", err.error);
      }),
    );

    listeners.push(
      PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          // Foreground: show sonner toast (handled by app-level Toaster)
          console.info("Push received:", notification.title, notification.body);
        },
      ),
    );

    listeners.push(
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          // Navigate to the relevant issue/chat from notification data
          const data = action.notification.data;
          if (data?.path) {
            // Navigation is handled by app router
            window.dispatchEvent(
              new CustomEvent("teamify:navigate", {
                detail: { path: data.path },
              }),
            );
          }
        },
      ),
    );
  };

  init().catch(console.error);

  return () => {
    listeners.forEach((l) => l.then((h) => h.remove()).catch(() => {}));
  };
}
