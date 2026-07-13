import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatArea } from "./chat-area";
import type { Agent } from "@teamify/core/types";

const { agent } = vi.hoisted((): { agent: Agent } => ({
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
}));

vi.mock("react-resizable-panels", () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: vi.fn() }),
}));

vi.mock("@teamify/ui/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div role="separator" />,
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
    if (queryKey[0] === "messages") return { data: [], isLoading: false };
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
  ChatMessageList: () => <div />,
  ChatMessageSkeleton: () => <div />,
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

describe("ChatArea", () => {
  it("uses the selected agent's custom empty-state title", () => {
    agent.chat_empty_state_title = "和财务智能体对话";

    try {
      render(
        <ChatArea
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

  it("renders reconciliation panel when the selected agent enables reconciliation", () => {
    render(
      <ChatArea
        activeSessionId={null}
        selectedAgentId="agent-1"
        onSessionCreated={vi.fn()}
        onAgentSelected={vi.fn()}
      />,
    );

    expect(screen.getByTestId("agent-reconciliation-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
  });

  it("keeps the reconciliation module visible while enabled config has no columns", () => {
    const originalConfig = agent.reconciliation_config;
    agent.reconciliation_config = {
      ...originalConfig!,
      columns: [],
    };

    try {
      render(
        <ChatArea
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
});
