import type { ReactNode } from "react";
import { useLogout } from "../auth";
import { DragStrip } from "../platform";
import { useT } from "../i18n";
import { Button } from "@teamify/ui/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";

interface InviteShellProps {
  onBack?: () => void;
  children: ReactNode;
  showLogout?: boolean;
}

/**
 * Shared chrome for every invite page render state (loading, error,
 * default, accepted, declined, signup). Keeps Back + Log out buttons
 * in a consistent position across all branches and across platforms.
 */
export function InviteShell({ onBack, children, showLogout = true }: InviteShellProps) {
  const { t } = useT("invite");
  const logout = useLogout();
  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      <DragStrip />
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-16 left-12 text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft />
          {t(($) => $.header.back)}
        </Button>
      )}
      {showLogout && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-16 right-12 text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut />
          {t(($) => $.header.log_out)}
        </Button>
      )}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
        {children}
      </div>
    </div>
  );
}
