import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReconciliationExperience } from "./reconciliation-experience";
import { renderWithI18n } from "../test/i18n";

const { summarySpy } = vi.hoisted(() => ({
  summarySpy: vi.fn(),
}));

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/reconciliation", () => ({
  workspaceReconciliationConfigOptions: (wsId: string) => ({
    queryKey: ["reconciliation", wsId, "config"],
    queryFn: () => Promise.resolve({
      summary_table_name: "order_category_summary",
      detail_table_name: "order_detail_import",
      batch_no_column: "doc_no",
      columns: [
        {
          key: "doc_no",
          label: "单据编号",
          type: "text",
          editable: false,
          visible: true,
        },
      ],
      detail_columns: [],
      filters: [],
      page_size: 20,
    }),
    enabled: !!wsId,
  }),
  workspaceReconciliationSummaryOptions: (
    wsId: string,
    params: Record<string, unknown>,
  ) => ({
    queryKey: ["reconciliation", wsId, "summary", params],
    queryFn: () => Promise.resolve({
      rows: [{ doc_no: "106-AR-00311457" }],
      total: 1,
      confirmation_status: {},
    }),
    enabled: !!wsId,
  }),
}));

vi.mock("./components/reconciliation-summary-panel", () => ({
  ReconciliationSummaryPanel: (props: {
    title?: string;
    onBatchOpen?: (batchNo: string) => void;
    headerAction?: React.ReactNode;
  }) => {
    summarySpy(props);
    return (
      <div>
        <span>{props.title}</span>
        {props.headerAction}
        <button type="button" onClick={() => props.onBatchOpen?.("106-AR-00311457")}>
          打开单据
        </button>
      </div>
    );
  },
}));

vi.mock("./reconciliation-detail-view", () => ({
  ReconciliationDetailView: ({
    batchNo,
    onBack,
    headerAction,
  }: {
    batchNo: string;
    onBack?: () => void;
    headerAction?: React.ReactNode;
  }) => (
    <div>
      <span>明细：{batchNo}</span>
      {headerAction}
      <button type="button" onClick={onBack}>
        返回汇总
      </button>
    </div>
  ),
}));

function renderExperience(headerAction?: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <ReconciliationExperience
        surface="embedded"
        detailMode="inline"
        titleOverride="Agent 对账"
        headerAction={headerAction}
      />
    </QueryClientProvider>,
  );
}

describe("ReconciliationExperience", () => {
  beforeEach(() => {
    summarySpy.mockClear();
  });

  it("uses workspace reconciliation content and opens details inline for embedded modules", async () => {
    renderExperience();

    expect(await screen.findByText("Agent 对账")).toBeInTheDocument();
    expect(summarySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Agent 对账",
        onBatchOpen: expect.any(Function),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "打开单据" }));
    expect(screen.getByText("明细：106-AR-00311457")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回汇总" }));
    expect(screen.getByText("Agent 对账")).toBeInTheDocument();
  });

  it("passes the header action through summary and inline detail views", async () => {
    renderExperience(<button type="button">Fullscreen</button>);

    expect(await screen.findByText("Agent 对账")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
    expect(summarySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headerAction: expect.anything(),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "打开单据" }));
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
  });
});
