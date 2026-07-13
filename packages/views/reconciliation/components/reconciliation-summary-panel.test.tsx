import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReconciliationSummaryPanel } from "./reconciliation-summary-panel";
import type { ChatTableColumn, ChatTableFilter } from "@teamify/core/types";
import { renderWithI18n } from "../../test/i18n";

const { confirmWorkspaceReconciliation, push, toastWarning } = vi.hoisted(() => ({
  confirmWorkspaceReconciliation: vi.fn(),
  push: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: toastWarning, error: vi.fn() },
}));

vi.mock("@teamify/core/reconciliation", () => ({
  useConfirmWorkspaceReconciliation: () => ({
    isPending: false,
    mutate: confirmWorkspaceReconciliation,
  }),
  useUnlockWorkspaceReconciliation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useExportReconciliation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("@teamify/core/paths", () => ({
  useWorkspacePaths: () => ({
    reconciliationDetail: (batchNo: string) => `/acme/reconciliation/${batchNo}`,
  }),
}));

vi.mock("../../navigation", () => ({
  useNavigation: () => ({ push }),
}));

const columns: ChatTableColumn[] = [
  {
    key: "doc_no",
    label: "单据编号",
    type: "text",
    editable: false,
    visible: true,
  },
  {
    key: "amount",
    label: "金额",
    type: "number",
    editable: false,
    visible: true,
  },
];

function renderPanel({
  filters = [],
  onFiltersChange = vi.fn(),
  onPageChange = vi.fn(),
  rows = [{ doc_no: "106-AR-00311457", amount: 100 }],
}: {
  filters?: ChatTableFilter[];
  onFiltersChange?: (filters: Record<string, unknown>) => void;
  onPageChange?: (page: number) => void;
  rows?: Record<string, unknown>[];
} = {}) {
  return renderWithI18n(
    <ReconciliationSummaryPanel
      columns={columns}
      filters={filters}
      batchNoColumn="doc_no"
      data={{
        total: rows.length,
        rows,
        confirmation_status: {
          "106-AR-00311457": {
            confirmed: false,
            locked: false,
          },
        },
      }}
      isLoading={false}
      onRefresh={vi.fn()}
      onFiltersChange={onFiltersChange}
      onPageChange={onPageChange}
      page={1}
      pageSize={20}
      wsId="ws-1"
    />,
    { locale: "zh-Hans" },
  );
}

describe("ReconciliationSummaryPanel", () => {
  beforeEach(() => {
    confirmWorkspaceReconciliation.mockReset();
    push.mockReset();
    toastWarning.mockReset();
  });

  it("adds a bottom confirm button for selected batches", async () => {
    const user = userEvent.setup();
    renderPanel();

    const bottomConfirm = screen.getByRole("button", { name: "确认" });
    expect(bottomConfirm).toBeDisabled();

    const batchRow = screen.getByText("106-AR-00311457").closest("tr");
    expect(batchRow).toBeTruthy();
    await user.click(within(batchRow as HTMLTableRowElement).getByRole("checkbox"));

    expect(bottomConfirm).toBeEnabled();
    await user.click(bottomConfirm);

    expect(confirmWorkspaceReconciliation).toHaveBeenCalledWith(
      ["106-AR-00311457"],
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("selects a batch without opening details when clicking the checkbox", async () => {
    const user = userEvent.setup();
    renderPanel();

    const batchRow = screen.getByText("106-AR-00311457").closest("tr");
    expect(batchRow).toBeTruthy();

    await user.click(within(batchRow as HTMLTableRowElement).getByRole("checkbox"));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();
  });

  it("keeps only failed batches selected after a partial confirmation", async () => {
    const user = userEvent.setup();
    renderPanel({
      rows: [
        { doc_no: "DOC-1", amount: 100 },
        { doc_no: "DOC-2", amount: 200 },
      ],
    });

    const firstRow = screen.getByText("DOC-1").closest("tr") as HTMLTableRowElement;
    const secondRow = screen.getByText("DOC-2").closest("tr") as HTMLTableRowElement;
    await user.click(within(firstRow).getByRole("checkbox"));
    await user.click(within(secondRow).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "确认" }));

    const options = confirmWorkspaceReconciliation.mock.calls[0]?.[1];
    act(() => {
      options.onSuccess({
        success: true,
        confirmed: ["DOC-1"],
        failed: [{ batch_no: "DOC-2", code: "invalid_state", message: "conflict" }],
      });
    });

    expect(within(firstRow).getByRole("checkbox")).not.toBeChecked();
    expect(within(secondRow).getByRole("checkbox")).toBeChecked();
    expect(toastWarning).toHaveBeenCalledOnce();
  });

  it("opens details when clicking the row outside the checkbox", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText("106-AR-00311457"));

    expect(push).toHaveBeenCalledWith("/acme/reconciliation/106-AR-00311457");
  });

  it("renders select and date filters from reconciliation config", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    const onPageChange = vi.fn();

    renderPanel({
      filters: [
        { key: "doc_type", label: "单据类型", type: "select" },
        { key: "shop_name", label: "店铺名称", type: "select" },
        {
          key: "status",
          label: "状态",
          type: "select",
          options: [{ label: "已确认", value: "confirmed" }],
        },
        { key: "period_start", label: "开始时间", type: "date" },
        { key: "period_end", label: "结束时间", type: "date" },
      ],
      rows: [
        {
          doc_no: "106-AR-00311457",
          amount: 100,
          doc_type: "应收单",
          shop_name: "杭州旗舰店",
          status: "draft",
        },
      ],
      onFiltersChange,
      onPageChange,
    });

    await user.click(screen.getByRole("button", { name: "单据类型筛选" }));
    await user.click(await screen.findByText("应收单"));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ doc_type: "应收单" });

    await user.click(screen.getByRole("button", { name: "店铺名称筛选" }));
    await user.click(await screen.findByText("杭州旗舰店"));
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      doc_type: "应收单",
      shop_name: "杭州旗舰店",
    });

    await user.click(screen.getByRole("button", { name: "状态筛选" }));
    await user.click(await screen.findByText("已确认"));
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      doc_type: "应收单",
      shop_name: "杭州旗舰店",
      status: "confirmed",
    });

    fireEvent.change(screen.getByLabelText("开始时间"), {
      target: { value: "2026-07-01" },
    });
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      doc_type: "应收单",
      shop_name: "杭州旗舰店",
      status: "confirmed",
      period_start: "2026-07-01",
    });

    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });
});
