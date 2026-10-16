import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@iteamify/core/api";
import { AppSidebar } from "./app-sidebar";

const {
  detail,
  deletePin,
  inboxItems,
  navigation,
  pins,
  summary,
  workspaces,
  currentWorkspace,
  assistantAgents,
} = vi.hoisted(() => ({
  detail: { current: { isPending: false, isError: false, data: null as unknown, error: null as unknown } },
  deletePin: vi.fn(),
  inboxItems: { current: [] as { id: string; read: boolean }[] },
  navigation: { current: { pathname: "/acme/issues", search: "" } },
  summary: { current: [] as { workspace_id: string; count: number }[] },
  workspaces: {
    current: [] as { id: string; name: string; slug: string; avatar_url: string | null }[],
  },
  pins: {
    current: [
      {
        id: "pin-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        item_type: "issue" as const,
        item_id: "issue-1",
        position: 0,
        created_at: "2026-05-06T00:00:00Z",
      },
    ],
  },
  currentWorkspace: {
    current: { id: "ws-1", name: "Acme", slug: "acme" },
  },
  // "我的助手" group source — controlled per test via the agentListOptions mock.
  assistantAgents: {
    current: [] as {
      id: string;
      name: string;
      avatar_url: string | null;
      archived_at?: string | null;
    }[],
  },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn() }),
  verticalListSortingStrategy: vi.fn(),
}));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => undefined } } }));
vi.mock("@iteamify/ui/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <section data-sidebar-group>{children}</section>
  ),
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarMenuButton: ({
    children,
    isActive,
    render,
  }: {
    children: React.ReactNode;
    isActive?: boolean;
    render?: React.ReactElement<{ href?: string }>;
  }) => (
    <button type="button" data-active={isActive ? "true" : undefined} data-href={render?.props.href}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarRail: () => null,
}));
vi.mock("@iteamify/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}));
vi.mock("@iteamify/ui/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CollapsibleTrigger: () => <button type="button" />,
}));
vi.mock("@iteamify/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("./help-launcher", () => ({ HelpLauncher: () => null }));
vi.mock("./wechat-card", () => ({
  WechatCard: () => <div data-testid="wechat-sidebar-card" />,
}));
vi.mock("../auth", () => ({ useLogout: () => vi.fn() }));
vi.mock("../issues/components/status-icon", () => ({ StatusIcon: () => <span /> }));
vi.mock("../navigation", () => ({
  AppLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useNavigation: () => ({
    pathname: navigation.current.pathname,
    push: vi.fn(),
    searchParams: new URLSearchParams(navigation.current.search ?? ""),
  }),
}));
vi.mock("../projects/components/project-icon", () => ({ ProjectIcon: () => <span /> }));
vi.mock("../workspace/workspace-avatar", () => ({ WorkspaceAvatar: () => <span /> }));
vi.mock("@iteamify/ui/components/common/actor-avatar", () => ({ ActorAvatar: () => <span /> }));

vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: "user-1" } }),
}));
vi.mock("@iteamify/core/paths", async (importOriginal) => ({
  // Spread the real module so pure helpers (resolveRouteIconName, used by the
  // nav to derive each item's icon from its href) stay intact; only the
  // workspace/context hooks below are stubbed to control routes in tests.
  ...(await importOriginal<typeof import("@iteamify/core/paths")>()),
  paths: {
    workspace: (slug: string) => ({
      root: () => `/${slug}`,
      issues: () => `/${slug}/issues`,
    }),
  },
  useCurrentWorkspace: () => currentWorkspace.current,
  useWorkspacePaths: () => {
    const slug = currentWorkspace.current.slug;
    return {
      root: () => `/${slug}`,
      inbox: () => `/${slug}/inbox`,
      chat: () => `/${slug}/chat`,
      myIssues: () => `/${slug}/my-issues`,
      issues: () => `/${slug}/issues`,
      projects: () => `/${slug}/projects`,
      autopilots: () => `/${slug}/autopilots`,
      agents: () => `/${slug}/agents`,
      members: () => `/${slug}/members`,
      memberDetail: (id: string) => `/${slug}/members/${id}`,
      applications: () => `/${slug}/applications`,
      squads: () => `/${slug}/squads`,
      usage: () => `/${slug}/usage`,
      runtimes: () => `/${slug}/runtimes`,
      skills: () => `/${slug}/skills`,
      settings: () => `/${slug}/settings`,
      connections: () => `/${slug}/connections`,
      issueDetail: (id: string) => `/${slug}/issues/${id}`,
      projectDetail: (id: string) => `/${slug}/projects/${id}`,
    };
  },
}));
vi.mock("@iteamify/core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@iteamify/core/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getBaseUrl: () => "http://127.0.0.1:8080",
    },
  };
});
vi.mock("@iteamify/core/inbox/queries", () => ({
  deduplicateInboxItems: (items: unknown[]) => items,
  inboxKeys: { list: () => ["inbox"], unreadSummary: () => ["inbox", "unread-summary"] },
  inboxUnreadSummaryOptions: () => ({ queryKey: ["inbox", "unread-summary"] }),
  hasOtherWorkspaceUnread: (
    entries: { workspace_id: string; count: number }[],
    currentWsId: string | null,
  ) => entries.some((s) => s.workspace_id !== currentWsId && s.count > 0),
  unreadWorkspaceIds: (entries: { workspace_id: string; count: number }[]) =>
    new Set(entries.filter((s) => s.count > 0).map((s) => s.workspace_id)),
}));
vi.mock("@iteamify/core/issues/queries", () => ({ issueDetailOptions: () => ({ queryKey: ["issue"] }) }));
vi.mock("@iteamify/core/issues/stores/create-mode-store", () => ({
  useCreateModeStore: { getState: () => ({ lastMode: "agent" }) },
  openCreateIssueWithPreference: vi.fn(),
}));
vi.mock("@iteamify/core/issues/stores/draft-store", () => ({ useIssueDraftStore: () => false }));
vi.mock("@iteamify/core/modals", () => ({ useModalStore: { getState: () => ({ modal: null, open: vi.fn() }) } }));
vi.mock("@iteamify/core/pins/mutations", () => ({ useDeletePin: () => ({ mutate: deletePin }), useReorderPins: () => ({ mutate: vi.fn() }) }));
vi.mock("@iteamify/core/pins/queries", () => ({ pinListOptions: () => ({ queryKey: ["pins"] }) }));
vi.mock("@iteamify/core/projects/queries", () => ({ projectDetailOptions: () => ({ queryKey: ["project"] }) }));
vi.mock("@iteamify/core/workspace/queries", () => ({
  // Controlled so the "我的助手" group renders predictably in tests.
  agentListOptions: () => ({ queryKey: ["agents"] }),
  memberListOptions: () => ({ queryKey: ["members"] }),
  myInvitationListOptions: () => ({ queryKey: ["invitations"] }),
  workspaceKeys: { myInvitations: () => ["invitations"] },
  workspaceListOptions: () => ({ queryKey: ["workspaces"] }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "pins") return { data: pins.current };
    if (queryKey[0] === "issue") return detail.current;
    if (queryKey[0] === "inbox" && queryKey[1] === "unread-summary") return { data: summary.current };
    if (queryKey[0] === "inbox") return { data: inboxItems.current };
    if (queryKey[0] === "workspaces") return { data: workspaces.current };
    if (queryKey[0] === "agents") return { data: assistantAgents.current.map((a) => ({ ...a, owner_id: "user-1", permission_mode: "private", invocation_targets: [] })) };
    return { data: [] };
  },
  useQueryClient: () => ({ fetchQuery: vi.fn(), invalidateQueries: vi.fn() }),
}));

beforeEach(() => {
  assistantAgents.current = [];
  currentWorkspace.current = { id: "ws-1", name: "Acme", slug: "acme" };
});

describe("hidden workspace routes", () => {
  it("does not show the WeChat follow card in the workspace sidebar", () => {
    render(<AppSidebar />);
    expect(screen.queryByTestId("wechat-sidebar-card")).not.toBeInTheDocument();
  });

  it("does not expose the Prospector entry", () => {
    const { container } = render(<AppSidebar />);
    expect(
      container.querySelector('button[data-href="/acme/prospects"]'),
    ).toBeNull();
  });

  it("does not expose the Runtimes entry", () => {
    const { container } = render(<AppSidebar />);
    expect(
      container.querySelector('button[data-href="/acme/runtimes"]'),
    ).toBeNull();
  });
});

describe("navigation groups", () => {
  it("keeps project navigation and workspace search available", () => {
    const { container } = render(<AppSidebar searchSlot={<button data-testid="search-trigger">Search</button>} />);
    expect(container.querySelector('button[data-href="/acme/projects"]')).not.toBeNull();
    expect(screen.getByTestId("search-trigger")).toBeInTheDocument();
  });
});

describe("PinRow", () => {
  beforeEach(() => {
    deletePin.mockReset();
    navigation.current.pathname = "/acme/issues";
    detail.current = { isPending: false, isError: false, data: null, error: null };
    summary.current = [];
    workspaces.current = [];
  });

  it("unpins missing details", async () => {
    detail.current = { isPending: false, isError: true, data: null, error: new ApiError("missing", 404, "Not Found") };
    render(<AppSidebar />);
    await waitFor(() => expect(deletePin).toHaveBeenCalledTimes(1));
  });

  it("ignores non-404 errors", async () => {
    detail.current = { isPending: false, isError: true, data: null, error: new ApiError("error", 500, "Server Error") };
    render(<AppSidebar />);
    await waitFor(() => expect(deletePin).not.toHaveBeenCalled());
  });

  it("renders loaded details", async () => {
    detail.current = { isPending: false, isError: false, data: { identifier: "MUL-123", title: "Keep this pin", status: "todo" }, error: null };
    render(<AppSidebar />);
    expect(await screen.findByText("Keep this pin")).toBeInTheDocument();
    expect(screen.queryByText("MUL-123 Keep this pin")).not.toBeInTheDocument();
  });

  it("does not also highlight the parent workspace nav for an active pin", async () => {
    navigation.current.pathname = "/acme/issues/issue-1";
    detail.current = {
      isPending: false,
      isError: false,
      data: { identifier: "MUL-123", title: "Keep this pin", status: "todo" },
      error: null,
    };

    const { container } = render(<AppSidebar />);

    expect((await screen.findByText("Keep this pin")).closest("button")).toHaveAttribute(
      "data-active",
      "true",
    );
    // Issues nav is hidden by default now; assert against a still-visible
    // workspace nav item to keep checking that an active pin does not also
    // light up the workspace nav group.
    expect(container.querySelector('button[data-href="/acme/projects"]')).not.toHaveAttribute("data-active");
  });
});

describe("workspace-switcher unread dot", () => {
  beforeEach(() => {
    summary.current = [];
    workspaces.current = [];
  });

  // The aggregate switcher dot is the only `.ring-sidebar` span in the tree
  // (DraftDot is null when there's no draft, and there are no invitations).
  const dot = (container: HTMLElement) => container.querySelector("span.bg-brand.ring-sidebar");

  it("shows a dot when another workspace has unread inbox items", () => {
    summary.current = [{ workspace_id: "ws-2", count: 3 }];
    const { container } = render(<AppSidebar />);
    expect(dot(container)).not.toBeNull();
  });

  it("does not show a dot when only the active workspace has unread", () => {
    // Active workspace is ws-1 (see useCurrentWorkspace mock).
    summary.current = [{ workspace_id: "ws-1", count: 3 }];
    const { container } = render(<AppSidebar />);
    expect(dot(container)).toBeNull();
  });

  it("does not show a dot when no workspace has unread", () => {
    summary.current = [];
    const { container } = render(<AppSidebar />);
    expect(dot(container)).toBeNull();
  });
});

describe("workspace-switcher dropdown per-workspace dot", () => {
  beforeEach(() => {
    summary.current = [];
    // Active workspace is ws-1 (see useCurrentWorkspace mock); "Other" is ws-2.
    workspaces.current = [
      { id: "ws-1", name: "Active WS", slug: "active", avatar_url: null },
      { id: "ws-2", name: "Other WS", slug: "other", avatar_url: null },
    ];
  });

  // Row dots are brand dots WITHOUT the aggregate avatar dot's `ring-sidebar`.
  const rowDots = (container: HTMLElement) =>
    container.querySelectorAll("span.bg-brand:not(.ring-sidebar)");

  it("dots the specific other workspace that has unread", () => {
    summary.current = [{ workspace_id: "ws-2", count: 3 }];
    const { container } = render(<AppSidebar />);
    // Exactly one row dot, sitting right after the "Other WS" name; the active
    // row shows the check, not a dot.
    expect(rowDots(container)).toHaveLength(1);
    expect(screen.getByText("Other WS").nextElementSibling?.className).toContain("bg-brand");
    expect(screen.getByText("Active WS").nextElementSibling?.className ?? "").not.toContain("bg-brand");
  });

  it("does not dot a workspace whose unread count is zero", () => {
    summary.current = [{ workspace_id: "ws-2", count: 0 }];
    const { container } = render(<AppSidebar />);
    expect(rowDots(container)).toHaveLength(0);
  });

  it("never dots the active workspace even when it has unread", () => {
    summary.current = [{ workspace_id: "ws-1", count: 5 }];
    const { container } = render(<AppSidebar />);
    expect(rowDots(container)).toHaveLength(0);
  });
});

describe("company navigation", () => {
  it("uses the bare company root as the single Basic Info entry", () => {
    const { container } = render(<AppSidebar />);
    expect(container.querySelector('button[data-href="/acme"]')).not.toBeNull();
    expect(container.querySelector('button[data-href="/acme/business"]')).toBeNull();
    expect(container.querySelector('button[data-href="/acme/knowledge"]')).toBeNull();
  });
});

describe("我的助手 group", () => {
  it("renders one chat deep link per agent and keeps member management available when there are no agents", () => {
    const { container } = render(<AppSidebar />);
    // No agents by default → group (and its agent links) are absent.
    expect(container.querySelectorAll('button[data-href*="?agent="]')).toHaveLength(0);

    assistantAgents.current = [
      { id: "agent-1", name: "Alpha", avatar_url: null },
      { id: "agent-2", name: "Beta", avatar_url: null },
    ];
    const { container: container2 } = render(<AppSidebar />);
    const links = container2.querySelectorAll('button[data-href*="?agent="]');
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute("data-href")).toBe("/acme/chat?agent=agent-1");
    expect(links[1]!.getAttribute("data-href")).toBe("/acme/chat?agent=agent-2");
  });

  it("hides archived agents from the sidebar", () => {
    assistantAgents.current = [
      {
        id: "agent-active",
        name: "Active Assistant",
        avatar_url: null,
        archived_at: null,
      },
      {
        id: "agent-archived",
        name: "Archived CRM Assistant",
        avatar_url: null,
        archived_at: "2026-08-29T00:00:00Z",
      },
    ];

    const { container } = render(<AppSidebar />);

    expect(
      container.querySelector('button[data-href="/acme/chat?agent=agent-active"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[data-href="/acme/chat?agent=agent-archived"]'),
    ).toBeNull();
    expect(screen.queryByText("Archived CRM Assistant")).not.toBeInTheDocument();
  });
});
