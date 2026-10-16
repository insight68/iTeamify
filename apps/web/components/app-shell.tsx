import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@iteamify/ui/components/ui/sonner";
import { RESOURCES } from "@iteamify/views/locales";
import { getRequestLocale } from "@/lib/request-locale";
import {
  resolveBrowserApiBaseUrl,
  resolveBrowserWsUrl,
} from "@/config/runtime-urls";
import { WebProviders } from "@/components/web-providers";
import "@/app/globals.css";

/**
 * Full application runtime boundary.
 *
 * Marketing routes intentionally do not render this shell: auth bootstrap,
 * React Query, WebSocket, the complete product dictionaries, theme state and
 * the global toaster are application concerns. Route-group layouts opt into
 * this shell so adding a public marketing route cannot accidentally pull the
 * entire authenticated application into its hydration graph.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const resources = { [locale]: RESOURCES[locale] };
  const apiBaseUrl = resolveBrowserApiBaseUrl(process.env);
  const wsUrl = resolveBrowserWsUrl(process.env);

  return (
    <ThemeProvider>
      <WebProviders
        locale={locale}
        resources={resources}
        apiBaseUrl={apiBaseUrl}
        wsUrl={wsUrl}
      >
        {children}
      </WebProviders>
      <Toaster />
    </ThemeProvider>
  );
}
