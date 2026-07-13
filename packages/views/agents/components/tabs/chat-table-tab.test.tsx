import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatTableTab } from "./chat-table-tab";
import type { Agent } from "@teamify/core/types";
import { renderWithI18n } from "../../../test/i18n";

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/datasources/queries", () => ({
  dataSourceListOptions: (wsId: string) => ({
    queryKey: ["datasources", wsId],
    queryFn: () => Promise.resolve([]),
  }),
  dataTableListOptions: (wsId: string, dataSourceId: string) => ({
    queryKey: ["data-tables", wsId, dataSourceId],
    queryFn: () => Promise.resolve([]),
  }),
  tableColumnsOptions: (wsId: string, tableId: string) => ({
    queryKey: ["table-columns", wsId, tableId],
    queryFn: () => Promise.resolve({ columns: [] }),
  }),
}));

function createAgent(): Agent {
  return {
    id: "agent-1",
    workspace_id: "ws-1",
    runtime_id: "runtime-1",
    name: "Finance Agent",
    description: "",
    instructions: "",
    avatar_url: null,
    owner_id: "user-1",
    visibility: "workspace",
    status: "idle",
    runtime_mode: "cloud",
    runtime_config: {},
    custom_env: {},
    custom_args: [],
    custom_env_redacted: false,
    max_concurrent_tasks: 1,
    model: "gpt-5",
    skills: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    chat_table_config: {
      enabled: true,
      title: "Customers",
      columns: [],
      filters: [
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [],
        },
      ],
      page_size: 20,
    },
    reconciliation_config: undefined,
  } as Agent;
}

function renderTab(onSave = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return {
    onSave,
    ...renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <ChatTableTab
          agent={createAgent()}
          onSave={onSave}
          onDirtyChange={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("ChatTableTab", () => {
  it("saves options for select filters", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab();

    await user.click(screen.getByRole("button", { name: "+ Add" }));
    const labelInputs = screen.getAllByPlaceholderText("Label");
    const valueInput = screen.getByPlaceholderText("Value");
    await user.type(labelInputs[labelInputs.length - 1]!, "Active");
    await user.type(valueInput, "active");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        chat_table_config: expect.objectContaining({
          filters: [
            expect.objectContaining({
              key: "status",
              label: "Status",
              type: "select",
              options: [{ label: "Active", value: "active" }],
            }),
          ],
        }),
      });
    });
  });
});
