// @vitest-environment jsdom

import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Agent } from "@iteamify/core/types";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enCommon from "../locales/en/common.json";
import enChat from "../locales/en/chat.json";
import {
  NavigationProvider,
  type NavigationAdapter,
} from "../navigation";

const TEST_RESOURCES = { en: { common: enCommon, chat: enChat } };

const defaultLayoutRef = vi.hoisted(() => ({
  current: undefined as Record<string, number> | undefined,
}));
const isMobileRef = vi.hoisted(() => ({ current: false }));
const listPanelPropsRef = vi.hoisted(() => ({
  current: null as null | {
    collapsedSize?: number;
    collapsible?: boolean;
    onResize?: (size: { asPercentage: number; inPixels: number }) => void;
  },
}));
const mockListPanelCollapse = vi.hoisted(() => vi.fn());
const mockListPanelExpand = vi.hoisted(() => vi.fn());
const mockListPanelIsCollapsed = vi.hoisted(() => vi.fn(() => false));
const listPanelRef = vi.hoisted(() => ({
  current: {
    collapse: mockListPanelCollapse,
    expand: mockListPanelExpand,
    isCollapsed: mockListPanelIsCollapsed,
  },
}));
const mockRequestAnimationFrame = vi.hoisted(() =>
  vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }),
);

// These tests target the page-level URL wiring (`?agent=` / `?session=`), so
// the conversation internals are stubbed and the controller is replaced with
// a ref-driven fake the tests can steer. The thread-list stub stays
// interactive: selecting a thread is the user action that must supersede a
// pending `?agent=` intent.
vi.mock("./components/chat-message-list", () => ({
  ChatMessageList: () => <div>chat-message-list</div>,
  ChatMessageSkeleton: () => <div>chat-message-skeleton</div>,
}));
vi.mock("./components/chat-input", () => ({
  ChatInput: () => <div>chat-input</div>,
}));
vi.mock("./components/chat-thread-list", () => ({
  ChatThreadList: ({
    onSelectSession,
  }: {
    onSelectSession: (s: { id: string; agent_id: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelectSession({ id: "session-9", agent_id: "agent-9" })}
    >
      select-thread
    </button>
  ),
}));
vi.mock("./components/chat-session-header", () => ({
  ChatSessionHeader: () => <div>chat-session-header</div>,
}));
vi.mock("./components/chat-empty-state", () => ({
  EmptyState: () => <div>chat-empty-state</div>,
}));
vi.mock("./components/new-chat-button", () => ({
  NewChatButton: () => <div>new-chat-button</div>,
}));
vi.mock("./components/offline-banner", () => ({
  OfflineBanner: () => null,
}));
vi.mock("./components/no-agent-banner", () => ({
  NoAgentBanner: () => null,
}));
vi.mock("./components/archived-agent-banner", () => ({
  ArchivedAgentBanner: () => null,
}));
vi.mock("react-resizable-panels", () => ({
  useDefaultLayout: () => ({
    defaultLayout: defaultLayoutRef.current,
    onLayoutChanged: vi.fn(),
  }),
  usePanelRef: () => listPanelRef,
}));
vi.mock("@iteamify/ui/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanel: ({
    children,
    id,
    ...props
  }: {
    children: React.ReactNode;
    id?: string;
    collapsedSize?: number;
    collapsible?: boolean;
    onResize?: (size: { asPercentage: number; inPixels: number }) => void;
  }) => {
    if (id === "list") listPanelPropsRef.current = props;
    return <div data-panel-id={id}>{children}</div>;
  },
  ResizableHandle: () => null,
}));
vi.mock("@iteamify/ui/hooks/use-mobile", () => ({
  useIsMobile: () => isMobileRef.current,
}));
vi.mock("@iteamify/core/paths", () => ({
  useWorkspacePaths: () => ({ chat: () => "/acme/chat" }),
}));

// The store mock is REACTIVE like real Zustand: setActiveSession replaces the
// snapshot and notifies subscribers, and the controller mock subscribes via
// useSyncExternalStore. A plain mutable ref would let React bail out of
// committing the post-effect re-render (no React state changed), leaving the
// DOM frozen on the first commit — which silently hides exactly the class of
// bug the StrictMode regression below exists to catch.
const storeRef = vi.hoisted(() => ({
  current: { activeSessionId: null as string | null },
}));
const storeListeners = vi.hoisted(() => new Set<() => void>());
const availableAgentsRef = vi.hoisted(() => ({ current: [] as Agent[] }));
const sessionsRef = vi.hoisted(() => ({ current: [] as import("@iteamify/core/types").ChatSession[] }));
const sessionsLoadedRef = vi.hoisted(() => ({ current: true }));
const agentsSettledRef = vi.hoisted(() => ({ current: true }));
const mockStartNewChat = vi.hoisted(() => vi.fn());
const mockSelectSession = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockSetActiveSession = vi.hoisted(() =>
  vi.fn((id: string | null) => {
    storeRef.current = { ...storeRef.current, activeSessionId: id };
    storeListeners.forEach((l) => l());
  }),
);
const subscribeToStore = vi.hoisted(() => (cb: () => void) => {
  storeListeners.add(cb);
  return () => storeListeners.delete(cb);
});

vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@iteamify/core/auth", () => ({ useAuthStore: (select: (s: {user:{id:string}}) => unknown) => select({user:{id:"user-1"}}) }));
vi.mock("@iteamify/core/workspace/queries", () => ({agentListOptions: () => ({testQuery:"agents"}),memberListOptions: () => ({testQuery:"members"})}));
vi.mock("@iteamify/core/chat/queries", () => ({chatSessionsOptions: () => ({testQuery:"sessions"}),scopedAgentSessionsOptions: () => ({testQuery:"scoped"}),chatSessionOptions: () => ({testQuery:"session"})}));
vi.mock("@iteamify/core/chat/mutations", () => ({useSetChatSessionArchived: () => ({mutate:vi.fn()})}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
 ...await importOriginal<typeof import("@tanstack/react-query")>(),
 useQuery: (options: {testQuery?:string}) => {
  const data = options.testQuery === "agents" ? availableAgentsRef.current : options.testQuery === "members" ? [{user_id:"user-1",role:"member"}] : options.testQuery === "sessions" ? sessionsRef.current : options.testQuery === "session" ? undefined : [];
  const settled = options.testQuery === "agents" || options.testQuery === "members" ? agentsSettledRef.current : true;
  return {data,isSuccess:settled,isPending:!settled,isError:false};
 },
 useInfiniteQuery: () => ({data:{pages:[{sessions:sessionsRef.current,next_cursor:null}]},isSuccess:sessionsLoadedRef.current,isPending:!sessionsLoadedRef.current,isError:false,hasNextPage:false}),
}));
vi.mock("@iteamify/core/team", () => ({ teamActivityOptions: () => ({}) }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

vi.mock("@iteamify/core/chat", () => ({
  useChatStore: Object.assign(
    (selector?: (s: { activeSessionId: string | null }) => unknown) =>
      selector ? selector(storeRef.current) : storeRef.current,
    { getState: () => storeRef.current },
  ),
}));

vi.mock("./components/use-chat-controller", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useChatController: () => ({
      wsId: "ws-1",
      user: { id: "user-1" },
      agents: availableAgentsRef.current,
      availableAgents: availableAgentsRef.current,
      agentsSettled: agentsSettledRef.current,
      sessions: sessionsRef.current,
      sessionsLoaded: sessionsLoadedRef.current,
      activeSessionId: useSyncExternalStore(
        subscribeToStore,
        () => storeRef.current,
      ).activeSessionId,
      selectedAgentId: null,
      currentSession: null,
      isSessionArchived: false,
      isAgentArchived: false,
      activeAgent: availableAgentsRef.current[0] ?? null,
      noAgent: false,
      availability: "online",
      messages: [],
      pendingTask: null,
      pendingTaskId: null,
      showSkeleton: false,
      hasMessages: false,
      firstItemIndex: 0,
      hasOlderMessages: false,
      isFetchingOlderMessages: false,
      fetchOlderMessages: vi.fn(),
      restoreDraftRequest: null,
      handleRestoreDraftConsumed: vi.fn(),
      focusInputRequest: 0,
      handleSend: vi.fn(),
      handleStop: vi.fn(),
      handleUploadFile: vi.fn(),
      handleNewChat: vi.fn(),
      handleStartNewChat: mockStartNewChat,
      handleSelectSession: mockSelectSession,
      advanceSelectionAfterArchive: vi.fn(),
      archiveSession: vi.fn(),
      setActiveSession: mockSetActiveSession,
      setSelectedAgentId: vi.fn(),
    }),
  };
});

import { ChatPage } from "./chat-page";

const agent: Agent = {
  id: "agent-1",
  workspace_id: "ws-1",
  runtime_id: "runtime-1",
  name: "Lambda",
  description: "",
  instructions: "",
  avatar_url: null,
  runtime_mode: "local",
  runtime_config: {},
  custom_args: [],
  visibility: "workspace",
  permission_mode: "public_to",
  invocation_targets: [{ target_type: "workspace", target_id: null }],
  status: "idle",
  max_concurrent_tasks: 1,
  model: "",
  owner_id: "user-2",
  skills: [],
  created_at: "2026-05-28T00:00:00Z",
  updated_at: "2026-05-28T00:00:00Z",
  archived_at: null,
  archived_by: null,
};


function renderPage(search: string, { strict = false } = {}) {
  const replace = vi.fn();
  const navigation: NavigationAdapter = {
    push: vi.fn(),
    replace,
    back: vi.fn(),
    pathname: "/acme/chat",
    searchParams: new URLSearchParams(search),
    getShareableUrl: (path) => path,
  };
  // A fresh element per render — reusing one element object lets React bail
  // out of re-rendering, which would make the rerender-based tests vacuous.
  const makeUi = () => {
    const page = (
      <I18nProvider locale="en" resources={TEST_RESOURCES}>
        <NavigationProvider value={navigation}>
          <ChatPage />
        </NavigationProvider>
      </I18nProvider>
    );
    return strict ? <StrictMode>{page}</StrictMode> : page;
  };
  const view = render(makeUi());
  return { replace, rerender: () => view.rerender(makeUi()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", mockRequestAnimationFrame);
  storeRef.current = { activeSessionId: null };
  storeListeners.clear();
  availableAgentsRef.current = [agent];
  agentsSettledRef.current = true;
  sessionsRef.current = [];
  sessionsLoadedRef.current = true;
  defaultLayoutRef.current = undefined;
  isMobileRef.current = false;
  listPanelPropsRef.current = null;
  mockListPanelIsCollapsed.mockReturnValue(false);
});

describe("ChatPage conversation list", () => {
  it("collapses the open desktop list from the persistent detail-pane control", () => {
    renderPage("");

    expect(listPanelPropsRef.current).toMatchObject({
      collapsedSize: 0,
      collapsible: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Hide conversation list" }));

    expect(mockListPanelCollapse).toHaveBeenCalledTimes(1);
    expect(mockListPanelExpand).not.toHaveBeenCalled();
  });

  it("restores a collapsed layout and expands it from the same control", () => {
    defaultLayoutRef.current = { list: 0, detail: 100 };
    mockListPanelIsCollapsed.mockReturnValue(true);

    renderPage("");
    fireEvent.click(screen.getByRole("button", { name: "Show conversation list" }));

    expect(mockListPanelExpand).toHaveBeenCalledTimes(1);
    expect(mockListPanelCollapse).not.toHaveBeenCalled();
  });

  it("keeps the control in sync when dragging the list closed and open", () => {
    renderPage("");

    act(() => {
      listPanelPropsRef.current?.onResize?.({ asPercentage: 0, inPixels: 0 });
    });
    expect(
      screen.getByRole("button", { name: "Show conversation list" }),
    ).toBeInTheDocument();

    act(() => {
      listPanelPropsRef.current?.onResize?.({ asPercentage: 25, inPixels: 320 });
    });
    expect(
      screen.getByRole("button", { name: "Hide conversation list" }),
    ).toBeInTheDocument();
  });

  it("leaves the existing mobile list flow unchanged", () => {
    isMobileRef.current = true;

    renderPage("");

    expect(screen.getByText("select-thread")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hide conversation list" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show conversation list" }),
    ).not.toBeInTheDocument();
  });
});

describe("ChatPage scoped URL selection", () => {
  it("preserves object identity when resuming the latest active session", () => {
    sessionsRef.current = [{ id: "recent", agent_id: "agent-1", status: "active" }] as typeof sessionsRef.current;
    const { replace } = renderPage("?agent=agent-1");
    expect(replace).toHaveBeenCalledWith("/acme/chat?agent=agent-1&session=recent");
    expect(mockSetActiveSession).not.toHaveBeenCalled();
  });
  it("opens an isolated draft without creating a session", () => {
    const { replace } = renderPage("?agent=agent-1");
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/chat\?agent=agent-1&new=/));
    expect(mockStartNewChat).not.toHaveBeenCalled();
  });
  it("waits for both session and agent permissions to resolve", () => {
    agentsSettledRef.current = false;
    const { replace, rerender } = renderPage("?agent=agent-1");
    expect(replace).not.toHaveBeenCalled();
    agentsSettledRef.current = true;
    rerender();
    expect(replace).toHaveBeenCalledOnce();
  });
  it("keeps an explicit session or new draft authoritative across refetches", () => {
    const { replace, rerender } = renderPage("?agent=agent-1&session=older");
    sessionsRef.current = [{ id: "recent", status: "active" }] as typeof sessionsRef.current;
    rerender();
    expect(replace).not.toHaveBeenCalled();
  });
  it("does not replay an auto-open under StrictMode", () => {
    const { replace, rerender } = renderPage("?agent=agent-1", { strict: true });
    rerender();
    expect(replace).toHaveBeenCalledOnce();
    expect(storeRef.current.activeSessionId).toBeNull();
  });
  it("does not overwrite a manual choice when queries resolve late", () => {
    agentsSettledRef.current = false;
    const { replace, rerender } = renderPage("?agent=agent-1");
    fireEvent.click(screen.getByRole("button", { name: "select-thread" }));
    agentsSettledRef.current = true;
    rerender();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/acme/chat?agent=agent-1&session=session-9");
  });
  it("retains the mobile list on back navigation", () => {
    const { replace } = renderPage("?agent=agent-1&view=list");
    expect(replace).not.toHaveBeenCalled();
  });
});
