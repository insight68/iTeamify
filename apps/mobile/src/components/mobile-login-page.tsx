import { LoginPage } from "@teamify/views/auth";
import { TeamifyIcon } from "@teamify/ui/components/common/teamify-icon";
import { Browser } from "@capacitor/browser";

const APP_URL = import.meta.env.VITE_APP_URL || "https://teamify.world";

export function MobileLoginPage() {
  const handleGoogleLogin = () => {
    // Open web login page in the system browser with platform=mobile flag.
    // The web callback redirects back via deep link with the token.
    void Browser.open({ url: `${APP_URL}/login?platform=mobile` });
  };

  return (
    <div className="flex h-screen flex-col">
      <LoginPage
        logo={<TeamifyIcon bordered size="lg" />}
        defaultMode="password"
        onSuccess={() => {
          // Auth store update triggers AppContent re-render → shows MobileShell.
        }}
        onGoogleLogin={handleGoogleLogin}
      />
    </div>
  );
}
