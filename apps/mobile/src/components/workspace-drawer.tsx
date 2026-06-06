import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut, Settings, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@teamify/ui/components/ui/sheet";
import { Avatar, AvatarFallback } from "@teamify/ui/components/ui/avatar";
import { useAuthStore } from "@teamify/core/auth";
import { workspaceListOptions } from "@teamify/core/workspace/queries";
import { useNavigation } from "@teamify/views/navigation";
import { cn } from "@teamify/ui/lib/utils";

interface WorkspaceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceDrawer({ open, onOpenChange }: WorkspaceDrawerProps) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: workspaces = [] } = useQuery(workspaceListOptions());

  // Determine current slug from URL
  const currentSlug = window.location.pathname.split("/")[1] ?? "";

  const handleWorkspaceSwitch = (slug: string) => {
    navigation.push(`/${slug}/issues`);
    onOpenChange(false);
  };

  const handleSettings = () => {
    if (currentSlug) {
      navigate(`/${currentSlug}/settings`);
    }
    onOpenChange(false);
  };

  const handleLogout = () => {
    onOpenChange(false);
    logout();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {user?.email?.[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-medium">{user?.name ?? "User"}</span>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">
            Workspaces
          </p>
          {workspaces.map((ws: { id: string; slug: string; name: string }) => (
            <button
              key={ws.id}
              onClick={() => handleWorkspaceSwitch(ws.slug)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                ws.slug === currentSlug
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <Avatar className="size-6">
                <AvatarFallback className="text-xs">
                  {ws.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 text-left">{ws.name}</span>
              {ws.slug === currentSlug && (
                <Check className="size-4 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t pt-4">
          <button
            onClick={handleSettings}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/50"
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
