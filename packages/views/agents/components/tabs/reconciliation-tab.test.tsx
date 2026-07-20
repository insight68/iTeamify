import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReconciliationTab } from "./reconciliation-tab";
import type { Agent } from "@teamify/core/types";
import { renderWithI18n } from "../../../test/i18n";

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
    chat_table_config: undefined,
    reconciliation_config: {
      enabled: true,
      title: "对账确认",
      data_source_id: "legacy-ds",
      summary_table_id: "legacy-summary",
      summary_table_name: "summary_table",
      detail_table_id: "legacy-detail",
      detail_table_name: "detail_table",
      batch_no_column: "batch_no",
      confirmable: true,
      columns: [],
      filters: [],
      page_size: 20,
    },
  } as Agent;
}

describe("ReconciliationTab", () => {
  it("does not render data source configuration controls", () => {
    renderWithI18n(
      <ReconciliationTab
        agent={createAgent()}
        onSave={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("数据源配置")).not.toBeInTheDocument();
    expect(screen.queryByText("数据源")).not.toBeInTheDocument();
    expect(screen.queryByText("汇总表")).not.toBeInTheDocument();
    expect(screen.queryByText("明细表")).not.toBeInTheDocument();
    expect(screen.getByText("Batch number column")).toBeInTheDocument();
  });
});
