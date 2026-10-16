import { LoginPage } from "@iteamify/views/auth";
import { DragStrip } from "@iteamify/views/platform";
import { ITeamifyIcon } from "@iteamify/ui/components/common/iteamify-icon";
import { useConfigStore } from "@iteamify/core/config";

function requireRuntimeAppUrl(): string {
  const runtimeConfig = window.desktopAPI.runtimeConfig;
  if (!runtimeConfig.ok) {
    throw new Error(
      "Invariant violated: DesktopLoginPage rendered before App accepted runtime config",
    );
  }
  return runtimeConfig.config.appUrl;
}

export function DesktopLoginPage() {
  const passwordEnabled = useConfigStore((state) => state.passwordAuthEnabled);
  const allowSignup = useConfigStore((state) => state.allowSignup);
  const webUrl = requireRuntimeAppUrl();
  const handleGoogleLogin = () => {
    // Open web login page in the default browser with platform=desktop flag.
    // The web callback will redirect back via iteamify:// deep link with the token.
    window.desktopAPI.openExternal(
      `${webUrl}/login?platform=desktop`,
    );
  };

  return (
    <div className="flex h-screen flex-col">
      <DragStrip />
      <LoginPage
        passwordEnabled={passwordEnabled}
        allowSignup={allowSignup}
        logo={<ITeamifyIcon bordered size="lg" />}
        onSuccess={() => {
          // Auth store update triggers AppContent re-render → shows DesktopShell.
          // Initial workspace navigation happens in routes.tsx via IndexRedirect.
        }}
        onGoogleLogin={handleGoogleLogin}
      />
    </div>
  );
}
