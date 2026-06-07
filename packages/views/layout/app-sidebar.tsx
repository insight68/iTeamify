"use client";

import React, { lazy, Suspense, useEffect } from "react";
import { cn } from "@teamify/ui/lib/utils";
import { AppLink, useNavigation } from "../navigation";
import { HelpLauncher } from "./help-launcher";

const SortablePins = lazy(() => import("./sortable-pins").then((m) => ({ default: m.SortablePins })));
import {
  Inbox,
  ListTodo,
  Bot,
  Monitor,
  ChevronDown,
  ChevronRight,
  User,
  LogOut,
  Plus,
  Check,
  BookOpenText,
  SquarePen,
  CircleUser,
  FolderKanban,
  Zap,
  Search,
  Building2,
  Database,
  KeyRound,
  Server,
  Settings,
  Users,
} from "lucide-react";
import { WorkspaceAvatar } from "../workspace/workspace-avatar";
import { ActorAvatar } from "@teamify/ui/components/common/actor-avatar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@teamify/ui/components/ui/collapsible";
import { useCreateModeStore } from "@teamify/core/issues/stores/create-mode-store";
import { useSearchStore } from "../search/search-store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@teamify/ui/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamify/ui/components/ui/dropdown-menu";
import { useAuthStore } from "@teamify/core/auth";
import { useCurrentWorkspace, useWorkspacePaths, paths } from "@teamify/core/paths";
import { workspaceListOptions, myInvitationListOptions, workspaceKeys } from "@teamify/core/workspace/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inboxKeys, deduplicateInboxItems } from "@teamify/core/inbox/queries";
import { api } from "@teamify/core/api";
import { useModalStore } from "@teamify/core/modals";
import { useMyRuntimesNeedUpdate } from "@teamify/core/runtimes/hooks";
import { useIsOwner } from "@teamify/core/permissions";
import { pinListOptions } from "@teamify/core/pins/queries";
import { useDeletePin } from "@teamify/core/pins/mutations";
import type { PinnedItem } from "@teamify/core/types";
import { useLogout } from "../auth";
import { useT } from "../i18n";
import { SidebarChatsGroup } from "./sidebar-chats-group";

// Top-level nav items stay active when the user is on a child route
// (e.g. "Projects" stays lit on /:slug/projects/:id). Pinned items keep
// strict equality elsewhere — a pinned project shouldn't highlight on
// sub-pages of itself.
function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

// Stable empty arrays for query defaults. Using an inline `= []` default on
// `useQuery` creates a new array reference on every render when `data` is
// undefined (e.g. query disabled or loading) — which in turn breaks any
// `useEffect`/`useMemo` that depends on the value, and can trigger infinite
// re-render loops when the effect itself calls `setState`.
const EMPTY_PINS: PinnedItem[] = [];
const EMPTY_WORKSPACES: Awaited<ReturnType<typeof api.listWorkspaces>> = [];
const EMPTY_INVITATIONS: Awaited<ReturnType<typeof api.listMyInvitations>> = [];
const EMPTY_INBOX: Awaited<ReturnType<typeof api.listInbox>> = [];

// Nav items reference WorkspacePaths method names so they can be resolved
// against the current workspace slug at render time (see AppSidebar body).
// Only parameterless paths are valid nav destinations.
type NavKey =
  | "inbox"
  | "myIssues"
  | "issues"
  | "projects"
  | "autopilots"
  | "org"
  | "datasources"
  | "agents"
  | "runtimes"
  | "skills"
  | "settings";

// Special nav keys that don't map directly to WorkspacePaths methods
type SpecialNavKey = "tokens" | "daemon";

// Action items open modals or palettes instead of navigating
type ActionKey = "createIssue" | "search";

// Static schema (key + icon) — labels resolved at render via useT("layout").
type NavLabelKey =
  | "inbox"
  | "my_issues"
  | "issues"
  | "projects"
  | "autopilots"
  | "org"
  | "datasources"
  | "agents"
  | "runtimes"
  | "tokens"
  | "skills"
  | "settings"
  | "daemon"
  | "workspace"
  | "members"
  | "repositories";

type DigitalEmployeeNavItem = { key: NavKey | SpecialNavKey; labelKey: NavLabelKey; icon: typeof Inbox; desktopOnly?: boolean };

type ActionLabelKey = "new_issue" | "search";

type PersonalNavItem = { key: NavKey; labelKey: NavLabelKey; icon: typeof Inbox };
type ActionNavItem = { key: ActionKey; labelKey: ActionLabelKey; icon: typeof Inbox };

const personalNav: (PersonalNavItem | ActionNavItem)[] = [
  { key: "inbox", labelKey: "inbox", icon: Inbox },
  { key: "myIssues", labelKey: "my_issues", icon: CircleUser },
  { key: "createIssue", labelKey: "new_issue", icon: SquarePen },
  { key: "search", labelKey: "search", icon: Search },
];

const workspaceNav: { key: NavKey; labelKey: NavLabelKey; icon: typeof Inbox }[] = [
  { key: "issues", labelKey: "issues", icon: ListTodo },
  { key: "projects", labelKey: "projects", icon: FolderKanban },
  { key: "autopilots", labelKey: "autopilots", icon: Zap },
];

type ConfigureNavItem = {
  key: string;
  labelKey: NavLabelKey;
  icon: typeof Inbox;
  tab?: string;
};

const configureNav: ConfigureNavItem[] = [
  { key: "settings", labelKey: "settings", icon: User },
  { key: "workspace_tab", labelKey: "workspace", icon: Settings, tab: "workspace" },
  { key: "members_tab", labelKey: "members", icon: Users, tab: "members" },
  { key: "agents_tab", labelKey: "agents", icon: Bot, tab: "agents" },
];

const digitalEmployeeNav: DigitalEmployeeNavItem[] = [
  { key: "agents", labelKey: "agents", icon: Bot },
  { key: "org", labelKey: "org", icon: Building2 },
  { key: "datasources", labelKey: "datasources", icon: Database },
  { key: "skills", labelKey: "skills", icon: BookOpenText },
  { key: "runtimes", labelKey: "runtimes", icon: Monitor },
  { key: "tokens", labelKey: "tokens", icon: KeyRound },
  { key: "daemon", labelKey: "daemon", icon: Server, desktopOnly: true },
];

interface AppSidebarProps {
  /** Rendered above SidebarHeader (e.g. desktop traffic light spacer) */
  topSlot?: React.ReactNode;
  /** Extra className for SidebarHeader */
  headerClassName?: string;
  /** Extra style for SidebarHeader */
  headerStyle?: React.CSSProperties;
}

export function AppSidebar({ topSlot, headerClassName, headerStyle }: AppSidebarProps = {}) {
  const { t } = useT("layout");
  const { pathname, push, searchParams } = useNavigation();
  const user = useAuthStore((s) => s.user);
  const userId = useAuthStore((s) => s.user?.id);
  const logout = useLogout();
  const workspace = useCurrentWorkspace();
  const p = useWorkspacePaths();
  const { data: workspaces = EMPTY_WORKSPACES } = useQuery(workspaceListOptions());
  const { data: myInvitations = EMPTY_INVITATIONS } = useQuery(myInvitationListOptions());

  const wsId = workspace?.id;
  const { data: inboxItems = EMPTY_INBOX } = useQuery({
    queryKey: wsId ? inboxKeys.list(wsId) : ["inbox", "disabled"],
    queryFn: () => api.listInbox(),
    enabled: !!wsId,
  });
  const unreadCount = React.useMemo(
    () => deduplicateInboxItems(inboxItems).filter((i) => !i.read).length,
    [inboxItems],
  );
  const hasRuntimeUpdates = useMyRuntimesNeedUpdate(wsId);
  const { isOwner } = useIsOwner(wsId ?? "");
  const { data: pinnedItems = EMPTY_PINS } = useQuery({
    ...pinListOptions(wsId ?? "", userId ?? ""),
    enabled: !!wsId && !!userId,
  });
  const deletePin = useDeletePin();

  const queryClient = useQueryClient();
  const acceptInvitationMut = useMutation({
    mutationFn: (id: string) => api.acceptInvitation(id),
    // After accepting an invitation, navigate INTO the newly-joined workspace.
    // Otherwise the user stays on their current workspace and just sees the
    // new one appear in the dropdown — silent and confusing (this is MUL-820).
    onSuccess: async (_, invitationId) => {
      const invitation = myInvitations.find((i) => i.id === invitationId);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.myInvitations() });
      // staleTime: 0 forces a real network fetch — we need the joined workspace
      // in the list before we can resolve its slug for navigation.
      const list = await queryClient.fetchQuery({
        ...workspaceListOptions(),
        staleTime: 0,
      });
      const joined = invitation
        ? list.find((w) => w.id === invitation.workspace_id)
        : null;
      if (joined) {
        push(paths.workspace(joined.slug).issues());
      }
    },
  });
  const declineInvitationMut = useMutation({
    mutationFn: (id: string) => api.declineInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.myInvitations() });
    },
  });

  // Global "C" shortcut: opens whichever create mode the user landed on last
  // (agent vs manual), persisted in useCreateModeStore. The mode switch lives
  // inside both modal footers so users can flip without remembering which
  // shortcut goes where — `c` always means "open the create flow I prefer".
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;
      if (useModalStore.getState().modal) return;
      e.preventDefault();
      const lastMode = useCreateModeStore.getState().lastMode;
      if (lastMode === "manual") {
        // Auto-fill project when on a project detail page (manual form only —
        // agent mode lets the agent infer project from the prompt).
        const projectMatch = pathname.match(/^\/[^/]+\/projects\/([^/]+)$/);
        const data = projectMatch ? { project_id: projectMatch[1] } : undefined;
        useModalStore.getState().open("create-issue", data);
      } else {
        useModalStore.getState().open("quick-create-issue");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pathname]);

  return (
      <Sidebar variant="inset">
        {topSlot}
        {/* Workspace Switcher */}
        <SidebarHeader className={cn("py-3", headerClassName)} style={headerStyle}>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton>
                      <span className="relative">
                        <WorkspaceAvatar name={workspace?.name ?? "M"} size="sm" />
                        {myInvitations.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-1 ring-sidebar" />
                        )}
                      </span>
                      <span className="flex-1 truncate font-medium">
                        {workspace?.name ?? "Teamify"}
                      </span>
                      <ChevronDown className="size-3 text-muted-foreground" />
                    </SidebarMenuButton>
                  }
                />
                <DropdownMenuContent
                  className="w-auto min-w-56"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                >
                  <div className="flex items-center gap-2.5 px-2 py-1.5">
                    <ActorAvatar
                      name={user?.name ?? ""}
                      initials={(user?.name ?? "U").charAt(0).toUpperCase()}
                      avatarUrl={user?.avatar_url}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {user?.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground leading-tight">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {t(($) => $.sidebar.workspaces_label)}
                    </DropdownMenuLabel>
                    {workspaces.map((ws) => (
                      <DropdownMenuItem
                        key={ws.id}
                        render={
                          <AppLink href={paths.workspace(ws.slug).issues()} />
                        }
                      >
                        <WorkspaceAvatar name={ws.name} size="sm" />
                        <span className="flex-1 truncate">{ws.name}</span>
                        {ws.id === workspace?.id && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    {isOwner && (
                      <DropdownMenuItem
                        onClick={() =>
                          useModalStore.getState().open("create-workspace")
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t(($) => $.sidebar.create_workspace)}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                  {myInvitations.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {t(($) => $.sidebar.pending_invitations_label)}
                        </DropdownMenuLabel>
                        {myInvitations.map((inv) => (
                          <div key={inv.id} className="flex items-center gap-2 px-2 py-1.5">
                            <WorkspaceAvatar name={inv.workspace_name ?? "W"} size="sm" />
                            <span className="flex-1 truncate text-sm">{inv.workspace_name ?? t(($) => $.sidebar.invitation_workspace_fallback)}</span>
                            <button
                              type="button"
                              className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                              disabled={acceptInvitationMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                acceptInvitationMut.mutate(inv.id);
                              }}
                            >
                              {t(($) => $.sidebar.invitation_join)}
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50"
                              disabled={declineInvitationMut.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                declineInvitationMut.mutate(inv.id);
                              }}
                            >
                              {t(($) => $.sidebar.invitation_decline)}
                            </button>
                          </div>
                        ))}
                      </DropdownMenuGroup>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem variant="destructive" onClick={logout}>
                      <LogOut className="h-3.5 w-3.5" />
                      {t(($) => $.sidebar.log_out)}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Navigation */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {personalNav.map((item) => {
                  const isActionItem = item.key === "createIssue" || item.key === "search";
                  if (isActionItem) {
                    const actionItem = item as ActionNavItem;
                    return (
                      <SidebarMenuItem key={actionItem.key}>
                        <SidebarMenuButton
                          className="text-muted-foreground hover:not-data-active:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                          onClick={() => {
                            if (actionItem.key === "createIssue") {
                              useModalStore.getState().open("quick-create-issue");
                            } else if (actionItem.key === "search") {
                              useSearchStore.getState().setOpen(true);
                            }
                          }}
                        >
                          <actionItem.icon />
                          <span>{t(($) => $.sidebar[actionItem.labelKey])}</span>
                          {actionItem.key === "createIssue" && (
                            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">{t(($) => $.sidebar.new_issue_shortcut)}</kbd>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  const navItem = item as PersonalNavItem;
                  const href = p[navItem.key]();
                  const isActive = isNavActive(pathname, href);
                  return (
                    <SidebarMenuItem key={navItem.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<AppLink href={href} />}
                        className="text-muted-foreground hover:not-data-active:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                      >
                        <navItem.icon />
                        <span>{t(($) => $.nav[navItem.labelKey])}</span>
                        {navItem.key === "inbox" && unreadCount > 0 && (
                          <span className="ml-auto text-xs">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarChatsGroup wsId={wsId} userId={user?.id} />

          {pinnedItems.length > 0 && (
            <Collapsible defaultOpen>
              <SidebarGroup className="group/pinned">
                <SidebarGroupLabel
                  render={<CollapsibleTrigger />}
                  className="group/trigger cursor-pointer hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                >
                  <span>{t(($) => $.sidebar.pinned_label)}</span>
                  <ChevronRight className="!size-3 ml-1 stroke-[2.5] transition-transform duration-200 group-data-[panel-open]/trigger:rotate-90" />
                  <span className="ml-auto text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/pinned:opacity-100">{pinnedItems.length}</span>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <Suspense fallback={null}>
                      <SortablePins
                        pinnedItems={pinnedItems}
                        wsId={wsId}
                        pathname={pathname}
                        deletePin={deletePin}
                      />
                    </Suspense>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )}

          <SidebarGroup>
            <SidebarGroupLabel>{t(($) => $.sidebar.workspace_group)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {workspaceNav.map((item) => {
                  const href = p[item.key]();
                  const isActive = isNavActive(pathname, href);
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<AppLink href={href} />}
                        className="text-muted-foreground hover:not-data-active:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                      >
                        <item.icon />
                        <span>{t(($) => $.nav[item.labelKey])}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>{t(($) => $.sidebar.configure_group)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {configureNav.map((item) => {
                  const href = item.tab
                    ? p.settings() + "?tab=" + item.tab
                    : p.settings();
                  const isActive = item.tab
                    ? pathname === p.settings() && searchParams.get("tab") === item.tab
                    : isNavActive(pathname, href);
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<AppLink href={href} />}
                        className="text-muted-foreground hover:not-data-active:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                      >
                        <item.icon />
                        <span>{t(($) => $.nav[item.labelKey])}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {isOwner && (
            <SidebarGroup>
              <SidebarGroupLabel>{t(($) => $.sidebar.digital_employee_group)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {digitalEmployeeNav
                    .filter((item) => !item.desktopOnly || !!(window as unknown as { desktopAPI?: unknown }).desktopAPI)
                    .map((item) => {
                    // tokens & daemon link to settings?tab=<key> — special handling
                    const isSpecial = item.key === "tokens" || item.key === "daemon";
                    const navKey = item.key as NavKey;
                    const href = isSpecial
                      ? p.settings() + "?tab=" + item.key
                      : p[navKey]();
                    const isActive = isSpecial
                      ? pathname === p.settings() && searchParams.get("tab") === item.key
                      : isNavActive(pathname, p[navKey]());
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          isActive={isActive}
                          render={<AppLink href={href} />}
                          className="text-muted-foreground hover:not-data-active:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                        >
                          <item.icon />
                          <span>{t(($) => $.nav[item.labelKey])}</span>
                          {item.key === "runtimes" && hasRuntimeUpdates && (
                            <span className="ml-auto size-1.5 rounded-full bg-destructive" />
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="p-2">
          <div className="flex justify-end">
            <HelpLauncher />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
  );
}
