import { useMemo } from "react";
import {
  BrowserRouter,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  NavigationProvider,
  type NavigationAdapter,
} from "@teamify/views/navigation";
import { useAuthStore } from "@teamify/core/auth";
import { Browser } from "@capacitor/browser";

function MobileNavigationInner({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

  const adapter: NavigationAdapter = useMemo(
    () => ({
      push(path: string) {
        if (path === "/login") {
          useAuthStore.getState().logout();
          return;
        }
        navigate(path);
      },
      replace(path: string) {
        navigate(path, { replace: true });
      },
      back() {
        navigate(-1);
      },
      pathname: location.pathname,
      searchParams: searchParams,
      openInNewTab(path: string) {
        // On mobile, open external URLs in the system browser via Capacitor
        const url = path.startsWith("http")
          ? path
          : `${appUrl}${path}`;
        void Browser.open({ url });
      },
      getShareableUrl(path: string) {
        return `${appUrl}${path}`;
      },
    }),
    [navigate, location.pathname, searchParams, appUrl],
  );

  return <NavigationProvider value={adapter}>{children}</NavigationProvider>;
}

/**
 * Mobile navigation provider using BrowserRouter.
 * Capacitor deep links require real URL mapping, so we use BrowserRouter
 * instead of the MemoryRouter approach from desktop.
 */
export function MobileNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BrowserRouter>
      <MobileNavigationInner>{children}</MobileNavigationInner>
    </BrowserRouter>
  );
}
