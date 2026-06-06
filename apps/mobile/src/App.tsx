import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CoreProvider } from "@teamify/core/platform";
import { pickLocale } from "@teamify/core/i18n";
import { useAuthStore } from "@teamify/core/auth";
import { workspaceKeys, workspaceListOptions } from "@teamify/core/workspace/queries";
import { api } from "@teamify/core/api";
import { useHasOnboarded } from "@teamify/core/paths";
import { ThemeProvider } from "@teamify/ui/components/common/theme-provider";
import { TeamifyIcon } from "@teamify/ui/components/common/teamify-icon";
import { Toaster } from "@teamify/ui/components/ui/sonner";
import { RESOURCES } from "@teamify/views/locales";
import { MobileShell } from "./components/mobile-shell";
import { MobileLoginPage } from "./components/mobile-login-page";
import { createMobileLocaleAdapter } from "./platform/i18n-adapter";
import { initDeepLinks } from "./platform/deep-links";
import { initAppStateListener } from "./platform/native-bridge";
import { Capacitor } from "@capacitor/core";

const APP_VERSION = "1.11.0-rc2";

function AppContent() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const qc = useQueryClient();
  const [bootstrapping, setBootstrapping] = useState(false);

  // Deep link auth token handling
  useEffect(() => {
    return initDeepLinks((token) => {
      setBootstrapping(true);
      (async () => {
        try {
          await useAuthStore.getState().loginWithToken(token);
          const wsList = await api.listWorkspaces();
          qc.setQueryData(workspaceKeys.list(), wsList);
        } catch {
          // Token invalid or expired — stay on login page
        } finally {
          setBootstrapping(false);
        }
      })();
    });
  }, [qc]);

  // App state: resume WS and invalidate on foreground
  useEffect(() => {
    return initAppStateListener();
  }, []);

  const { data: workspaces = [], isFetched: workspaceListFetched } = useQuery({
    ...workspaceListOptions(),
    enabled: !!user,
  });
  const wsCount = workspaces.length;
  const hasOnboarded = useHasOnboarded();

  if (isLoading || bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center">
        <TeamifyIcon className="size-6 animate-pulse" />
      </div>
    );
  }

  return user ? <MobileShell workspaces={workspaces} workspaceListFetched={workspaceListFetched} wsCount={wsCount} hasOnboarded={hasOnboarded} /> : <MobileLoginPage />;
}

export default function App() {
  const localeAdapter = useMemo(
    () => createMobileLocaleAdapter(navigator.language),
    [],
  );
  const [locale, setLocale] = useState(() => pickLocale(localeAdapter));
  const resources = useMemo(
    () => ({ [locale]: RESOURCES[locale] }),
    [locale],
  );

  const identity = useMemo(
    () => ({
      platform: "mobile",
      version: APP_VERSION,
      os: Capacitor.getPlatform(),
    }),
    [],
  );

  // Resolve locale async on first mount (Capacitor Device API is async)
  useEffect(() => {
    (async () => {
      const adapter = createMobileLocaleAdapter(navigator.language);
      const resolved = pickLocale(adapter);
      if (resolved !== locale) {
        setLocale(resolved);
      }
    })();
  }, [locale]);

  return (
    <ThemeProvider>
      <CoreProvider
        apiBaseUrl={import.meta.env.VITE_API_URL}
        wsUrl={import.meta.env.VITE_WS_URL}
        onLogout={() => {
          // Clear mobile-specific state on logout
        }}
        identity={identity}
        locale={locale}
        resources={resources}
        localeAdapter={localeAdapter}
      >
        <AppContent />
      </CoreProvider>
      <Toaster />
    </ThemeProvider>
  );
}
