import { useLocation, useNavigate } from "react-router-dom";
import {
  ListTodo,
  Inbox,
  MessageSquare,
  Bot,
  Menu,
} from "lucide-react";
import { cn } from "@teamify/ui/lib/utils";
import { useState } from "react";
import { WorkspaceDrawer } from "./workspace-drawer";

const tabs = [
  { path: "issues", icon: ListTodo, label: "Issues" },
  { path: "inbox", icon: Inbox, label: "Inbox" },
  { path: "chats", icon: MessageSquare, label: "Chat" },
  { path: "agents", icon: Bot, label: "Agents" },
] as const;

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Extract current workspace slug from path
  const slug = location.pathname.split("/")[1] ?? "";
  const currentTab = location.pathname.split("/")[2] ?? "";

  const handleTabPress = (tabPath: string) => {
    if (slug) {
      navigate(`/${slug}/${tabPath}`);
    }
  };

  return (
    <>
      <nav
        className="flex shrink-0 items-center justify-around border-t bg-background px-2"
        style={{ height: "var(--tab-bar-height)", paddingBottom: "var(--safe-area-bottom)" }}
      >
        {tabs.map((tab) => {
          const isActive = currentTab === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => handleTabPress(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-1 text-xs transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-1 text-xs text-muted-foreground transition-colors"
        >
          <Menu className="size-5" />
          <span>More</span>
        </button>
      </nav>

      <WorkspaceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
