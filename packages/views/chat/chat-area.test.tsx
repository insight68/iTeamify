import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatWorkspace } from "./chat-workspace";
import type { Agent, ChatMessage } from "@teamify/core/types";

const { agent, chatMessages } = vi.hoisted((): {
  agent: Agent;
  chatMessages: ChatMessage[];
} => ({
  agent: {
    id: "agent-1",
    workspace_id: "ws-1",
    runtime_id: "runtime-1",
    name: "Finance Agent",
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "cloud",
    runtime_config: {},
    custom_env: {},
    custom_args: [],
    custom_env_redacted: false,
    visibility: "workspace",
    status: "idle",
    max_concurrent_tasks: 1,
    model: "gpt-5",
    owner_id: "user-1",
    skills: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    reconciliation_config: {
      enabled: true,
      title: "对账确认",
      batch_no_column: "batch_no",
      confirmable: true,
      columns: [
        {
          key: "batch_no",
          label: "批次",
          type: "text",
          editable: false,
          visible: true,
        },
      ],
      filters: [],
      page_size: 20,
    },
  },
  chatMessages: [],
}));

vi.mock("react-resizable-panels", () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
}));

vi.mock("@teamify/ui/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: ({
    className,
    withHandle,
    "aria-label": ariaLabel,
  }: {
    className?: string;
    withHandle?: boolean;
    "aria-label"?: string;
  }) => (
    <div role="separator" aria-label={ariaLabel} className={className}>
      {withHandle ? <div /> : null}
    </div>
  ),
}));

vi.mock("@teamify/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string; name: string } }) => unknown) =>
    selector({ user: { id: "user-1", name: "User" } }),
}));

vi.mock("@teamify/core/workspace/queries", () => ({
  agentListOptions: () => ({ queryKey: ["agents"] }),
  memberListOptions: () => ({ queryKey: ["members"] }),
}));

vi.mock("@teamify/core/chat/queries", () => ({
  chatKeys: {
    messages: (id: string) => ["messages", id],
    pendingTask: (id: string) => ["pendingTask", id],
  },
  chatMessagesOptions: () => ({ queryKey: ["messages"] }),
  pendingChatTaskOptions: () => ({ queryKey: ["pendingTask"] }),
}));

vi.mock("@teamify/core/chat/mutations", () => ({
  useCreateChatSession: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@teamify/core/chat", () => {
  const store = (selector: (state: { setActiveSession: (id: string | null) => void }) => unknown) =>
    selector({ setActiveSession: vi.fn() });
  return {
    useChatStore: Object.assign(store, {
      getState: () => ({ focusMode: false }),
    }),
  };
});

vi.mock("@teamify/core/agents", () => ({
  useAgentPresenceDetail: () => ({ availability: "online" }),
  useWorkspaceAgentAvailability: () => "available",
}));

vi.mock("@teamify/core/api", () => ({
  api: {
    sendChatMessage: vi.fn(),
    cancelTaskById: vi.fn(),
  },
}));

vi.mock("@teamify/core/hooks/use-file-upload", () => ({
  useFileUpload: () => ({ uploadWithToast: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "agents") return { data: [agent] };
    if (queryKey[0] === "members") return { data: [{ user_id: "user-1", role: "member" }] };
    if (queryKey[0] === "messages") return { data: chatMessages, isLoading: false };
    if (queryKey[0] === "pendingTask") return { data: null };
    return { data: null };
  },
  useQueryClient: () => ({ refetchQueries: vi.fn(), setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));

vi.mock("./components/agent-reconciliation-panel", () => ({
  AgentReconciliationPanel: () => <div data-testid="agent-reconciliation-panel" />,
}));

vi.mock("./components/agent-table-panel", () => ({
  AgentTablePanel: () => <div data-testid="agent-table-panel" />,
}));

vi.mock("./components/chat-input", () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock("./components/chat-message-list", () => ({
  ChatMessageList: ({
    scrollContainerRef,
  }: {
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  }) => <div ref={scrollContainerRef} data-testid="chat-message-list" />,
  ChatMessageSkeleton: () => <div />,
}));

vi.mock("./components/chat-turn-navigation-rail", () => ({
  CHAT_TURN_NAVIGATION_MIN_TURNS: 2,
  buildChatTurnNavigationItems: (
    messages: Array<{ id: string; role: string; content: string }>,
  ) =>
    messages
      .filter((message) => message.role === "user")
      .map((message) => ({
        id: message.id,
        prompt: message.content,
        response: "",
        isPending: false,
      })),
  ChatTurnNavigationRail: ({ items }: { items: Array<{ id: string }> }) =>
    items.length >= 2 ? (
      <nav data-testid="chat-turn-navigation-rail" />
    ) : null,
}));

vi.mock("./components/no-agent-banner", () => ({
  NoAgentBanner: () => null,
}));

vi.mock("./components/offline-banner", () => ({
  OfflineBanner: () => null,
}));

vi.mock("./components/context-anchor", () => ({
  ContextAnchorButton: () => null,
  ContextAnchorCard: () => null,
  buildAnchorMarkdown: () => "",
  useRouteAnchorCandidate: () => ({ candidate: null }),
}));

vi.mock("../common/actor-avatar", () => ({
  ActorAvatar: () => <span />,
}));

vi.mock("../i18n", () => ({
  useT: () => ({
    t: (selector: (resources: {
      window: Record<string, string>;
      empty_state: Record<string, string>;
      starter_prompts: Record<string, string>;
    }) => string) =>
      selector({
        window: {
          no_agents: "No agents",
          my_agents: "My agents",
          others: "Others",
        },
        empty_state: {
          first_time_title: "Start chat",
          first_time_intro: "",
          first_time_pillars: "",
          first_time_pillars_suffix: "",
          first_time_actions: "",
          returning_title_named: "Back",
          returning_title_default: "Back",
          returning_subtitle: "",
        },
        starter_prompts: {
          list_open: "List open",
          summarize_today: "Summarize",
          plan_next: "Plan",
        },
      }),
  }),
}));

const now = "2026-07-16T00:00:00Z";

function chatMessage(
  id: string,
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id,
    chat_session_id: "session-1",
    role,
    content,
    task_id: null,
    created_at: now,
  };
}

describe("ChatWorkspace", () => {
  it("uses the selected agent's custom empty-state title", () => {
    agent.chat_empty_state_title = "和财务智能体对话";

    try {
      render(
        <ChatWorkspace
          activeSessionId={null}
          selectedAgentId="agent-1"
          onSessionCreated={vi.fn()}
          onAgentSelected={vi.fn()}
        />,
      );

      expect(screen.getByText("和财务智能体对话")).toBeInTheDocument();
    } finally {
      agent.chat_empty_state_title = undefined;
    }
  });

  it.each([
    { routeState: "new chat", activeSessionId: null, selectedAgentId: null },
    { routeState: "agent chat", activeSessionId: null, selectedAgentId: "agent-1" },
    { routeState: "existing session", activeSessionId: "session-1", selectedAgentId: "agent-1" },
  ])("keeps tool modules outside the chat window for $routeState", ({
    activeSessionId,
    selectedAgentId,
  }) => {
    render(
      <ChatWorkspace
        activeSessionId={activeSessionId}
        selectedAgentId={selectedAgentId}
        onSessionCreated={vi.fn()}
        onAgentSelected={vi.fn()}
      />,
    );

    expect(screen.getByTestId("agent-reconciliation-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    expect(
      screen.getByTestId("agent-reconciliation-panel").closest('[data-slot="chat-tool-modules"]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId("agent-reconciliation-panel").closest('[data-slot="chat-window"]'),
    ).toBeNull();
    expect(
      screen.getByTestId("chat-input").closest('[data-slot="chat-window"]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId("chat-input").closest('[data-slot="chat-window"]'),
    ).toHaveClass("rounded-lg", "border", "shadow-sm");
    const toolModules = screen
      .getByTestId("agent-reconciliation-panel")
      .closest('[data-slot="chat-tool-modules"]');
    const chatWindow = screen
      .getByTestId("chat-input")
      .closest('[data-slot="chat-window"]');
    const separator = screen.getByRole("separator", {
      name: "Resize table and chat panels",
    });

    expect(
      screen.getByTestId("agent-reconciliation-panel")
        .closest('[data-slot="browser-fullscreen-frame"]'),
    ).toHaveClass("rounded-lg", "border", "shadow-sm");
    expect(toolModules).toHaveClass("px-2", "pb-0", "pt-2");
    expect(chatWindow?.parentElement).toHaveClass("px-2", "pb-2", "pt-0");
    expect(separator).toHaveClass(
      "data-[panel-group-direction=vertical]:h-1.5",
      "before:bg-border/20",
      "hover:before:bg-foreground/15",
      "focus-visible:before:bg-foreground/20",
      "data-[separator=active]:before:bg-foreground/20",
    );
    expect(separator).not.toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-ring/50",
    );
  });

  it("keeps the reconciliation module visible while enabled config has no columns", () => {
    const originalConfig = agent.reconciliation_config;
    agent.reconciliation_config = {
      ...originalConfig!,
      columns: [],
    };

    try {
      render(
        <ChatWorkspace
          activeSessionId={null}
          selectedAgentId="agent-1"
          onSessionCreated={vi.fn()}
          onAgentSelected={vi.fn()}
        />,
      );

      expect(screen.getByTestId("agent-reconciliation-panel")).toBeInTheDocument();
      expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    } finally {
      agent.reconciliation_config = originalConfig;
    }
  });

  it("keeps the two-turn navigation rail in the full chat window when tool modules are visible", () => {
    chatMessages.push(
      chatMessage("user-1", "user", "Check the first batch"),
      chatMessage("assistant-1", "assistant", "The first batch is balanced."),
      chatMessage("user-2", "user", "Check the second batch"),
      chatMessage("assistant-2", "assistant", "The second batch has one difference."),
    );

    try {
      render(
        <ChatWorkspace
          activeSessionId="session-1"
          selectedAgentId="agent-1"
          onSessionCreated={vi.fn()}
          onAgentSelected={vi.fn()}
        />,
      );

      const rail = screen.getByTestId("chat-turn-navigation-rail");
      const chatWindow = rail.closest('[data-slot="chat-window"]');

      expect(chatWindow).not.toBeNull();
      expect(chatWindow).toHaveAttribute(
        "data-turn-navigation-layout",
        "compact",
      );
      expect(chatWindow?.firstElementChild).toHaveClass("pl-9");
      expect(rail.closest('[data-slot="chat-tool-modules"]')).toBeNull();
      expect(
        screen.getByTestId("chat-input").closest('[data-slot="chat-window"]'),
      ).toBe(chatWindow);
    } finally {
      chatMessages.splice(0);
    }
  });
});
