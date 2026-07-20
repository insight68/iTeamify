import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentTablePanel } from "./agent-table-panel";
import type { ChatTableConfig } from "@teamify/core/types";

const {
  agentTableDataOptionsSpy,
  exportAgentTableData,
  clickSpy,
} = vi.hoisted(() => ({
  agentTableDataOptionsSpy: vi.fn(),
  exportAgentTableData: vi.fn(),
  clickSpy: vi.fn(),
}));

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string; name: string } }) => unknown) =>
    selector({ user: { id: "user-1", name: "Ada" } }),
}));

vi.mock("@teamify/core/chat/table-queries", () => ({
  agentTableDataOptions: (
    wsId: string,
    agentId: string,
    params: { filters?: Record<string, unknown>; page?: number; pageSize?: number },
  ) => ({
    queryKey: ["table-data", params],
    queryFn: () => Promise.resolve({
      rows: [{ id: 1, status: "active" }],
      total: 2,
    }),
    meta: agentTableDataOptionsSpy(wsId, agentId, params),
  }),
  tableDataKeys: {
    all: (wsId: string) => ["table-data", wsId],
  },
}));

vi.mock("@teamify/core/api", () => ({
  api: {
    exportAgentTableData,
  },
}));

vi.mock("@teamify/core/chat/table-mutations", () => ({
  useSaveTableData: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

vi.mock("@teamify/core/chat/table-export", () => ({
  buildAgentTableExportXlsxFileName: () => "customers-2026-07-05.xlsx",
}));

vi.mock("@teamify/core/chat", () => {
  const store = (selector: (state: { sessionFilters: Record<string, Record<string, unknown>> }) => unknown) =>
    selector({ sessionFilters: { "session-1": { status: "active" } } });
  return {
    useAgentTableFilterStore: Object.assign(store, {
      getState: () => ({
        sessionFilters: { "session-1": { status: "active" } },
        setSessionFilters: vi.fn(),
      }),
    }),
  };
});

vi.mock("../../i18n", () => ({
  useT: () => ({
    t: (selector: (resources: {
      table: Record<string, string>;
    }) => string) =>
      selector({
        table: {
          saving: "Saving...",
          save_failed_retry: "Save failed - retry",
          loading: "Loading table data...",
          load_failed: "Failed to load table data",
          load_failed_from: "Failed to load table data from {{table}}",
          retry: "Retry",
          export_all: "Download all filtered results",
          exporting: "Preparing download...",
          export_success: "Download started",
          export_failed: "Download failed",
          boolean_true: "true",
          boolean_false: "false",
        },
      }),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const config: ChatTableConfig = {
  enabled: true,
  title: "Customers",
  columns: [
    {
      key: "id",
      label: "ID",
      type: "number",
      editable: false,
      visible: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      editable: false,
      visible: true,
      options: [{ label: "Active", value: "active", color: "#00ff99" }],
    },
  ],
  filters: [],
  page_size: 20,
  row_color_column: "status",
};

const configWithFilters: ChatTableConfig = {
  ...config,
  filters: [
    {
      key: "tier",
      label: "Tier",
      type: "select",
      options: [
        { label: "Enterprise", value: "enterprise" },
        { label: "Startup", value: "startup" },
      ],
    },
    {
      key: "region",
      label: "Region",
      type: "multi_select",
      options: [
        { label: "East", value: "east" },
        { label: "West", value: "west" },
      ],
    },
  ],
};

function renderPanel(
  panelConfig = config,
  fullscreenControl?: React.ReactNode,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AgentTablePanel
        config={panelConfig}
        agentId="agent-1"
        sessionId="session-1"
        fullscreenControl={fullscreenControl}
      />
    </QueryClientProvider>,
  );
}

describe("AgentTablePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportAgentTableData.mockResolvedValue(new Blob(["xlsx"]));
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:table-export"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy);
  });

  it("opens select filters and applies the selected option", async () => {
    const user = userEvent.setup();
    renderPanel(configWithFilters);

    await user.click(screen.getByRole("button", { name: "Tier" }));
    await user.click(await screen.findByText("Enterprise"));

    expect(screen.getByRole("button", { name: "Tier" })).toHaveTextContent(
      "Enterprise",
    );
    await waitFor(() => {
      expect(agentTableDataOptionsSpy).toHaveBeenLastCalledWith(
        "ws-1",
        "agent-1",
        expect.objectContaining({
          filters: expect.objectContaining({
            status: "active",
            tier: "enterprise",
          }),
        }),
      );
    });
  });

  it("renders a fullscreen control in the table header", () => {
    renderPanel(config, <button type="button">Fullscreen</button>);

    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
  });

  it("applies multi-select filters as an array", async () => {
    const user = userEvent.setup();
    renderPanel(configWithFilters);

    await user.click(screen.getByRole("button", { name: "Region" }));
    await user.click(await screen.findByText("East"));
    await user.click(await screen.findByText("West"));

    expect(screen.getByRole("button", { name: "Region" })).toHaveTextContent(
      "Region (2)",
    );
    await waitFor(() => {
      expect(agentTableDataOptionsSpy).toHaveBeenLastCalledWith(
        "ws-1",
        "agent-1",
        expect.objectContaining({
          filters: expect.objectContaining({
            status: "active",
            region: ["east", "west"],
          }),
        }),
      );
    });
  });

  it("renders table cell content as selectable text", async () => {
    renderPanel();

    const cellText = await screen.findByText("active");

    expect(cellText).toHaveClass("select-text");
    expect(cellText).not.toHaveClass("select-none");
  });

  it("downloads all filtered table rows", async () => {
    renderPanel();

    const button = await screen.findByRole("button", {
      name: "Download all filtered results",
    });
    await waitFor(() => expect(button).not.toBeDisabled());

    fireEvent.click(button);

    await waitFor(() => {
      expect(exportAgentTableData).toHaveBeenCalledWith("agent-1", {
        status: "active",
      });
    });
    expect(clickSpy).toHaveBeenCalled();
  });
});
