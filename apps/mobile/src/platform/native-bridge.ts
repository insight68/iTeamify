import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { initPushNotifications } from "./push-notifications";

/**
 * Initialize native bridge: app state, status bar, splash screen, push notifications.
 * Returns a cleanup function.
 */
export function initAppStateListener(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  // Hide splash after app loads
  SplashScreen.hide().catch(() => {});

  // Set status bar to match theme
  const isDark = document.documentElement.classList.contains("dark");
  StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(
    () => {},
  );

  // Listen for theme changes
  const observer = new MutationObserver(() => {
    const dark = document.documentElement.classList.contains("dark");
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(
      () => {},
    );
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // App foreground/background
  const appListener = App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      // App came to foreground: invalidate queries to refresh data
      window.dispatchEvent(new CustomEvent("teamify:foreground"));
    }
  });

  // Push notifications
  const cleanupPush = initPushNotifications();

  return () => {
    observer.disconnect();
    appListener.then((l) => l.remove()).catch(() => {});
    cleanupPush();
  };
}
