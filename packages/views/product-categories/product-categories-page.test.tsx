import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "../test/i18n";
import { ProductCategoriesPage } from "./product-categories-page";

const { listQueryFn, mutateAsync, permissionState } = vi.hoisted(() => ({
  listQueryFn: vi.fn(),
  mutateAsync: vi.fn(),
  permissionState: { role: "admin" as "owner" | "admin" | "member" },
}));

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "workspace-1",
}));

vi.mock("@teamify/core/permissions", () => ({
  useCurrentMember: () => ({ role: permissionState.role, isLoading: false }),
}));

vi.mock("@teamify/core/product-categories", () => ({
  productCategoryListOptions: (wsId: string, params: Record<string, unknown>) => ({
    queryKey: ["product-categories", wsId, params],
    queryFn: listQueryFn,
    enabled: !!wsId,
  }),
  useUpdateProductCategory: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

const response = {
  available: true,
  reason: "",
  summary: {
    total: 2,
    mapped: 1,
    unmapped: 1,
    mixed: 0,
    category_count: 1,
    series_count: 1,
    last_updated_at: "2026-07-15T03:00:00Z",
  },
  categories: ["黑巧系列"],
  series: ["日常款"],
  rows: [{
    material_code: "3.0244",
    product_no: "s2022042705",
    product_name: "58g 55% 黑巧克力",
    brand_name: "诺梵",
    class_name: "巧克力",
    business_category_name: "黑巧系列",
    product_series_name: "日常款",
    taxonomy_status: "mapped",
    taxonomy_source: "business_mapping_v1",
    taxonomy_updated_at: "2026-07-15T03:00:00Z",
    synced_records: 2,
    credential_count: 1,
  }],
  total: 1,
  page: 1,
  page_size: 30,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <ProductCategoriesPage />
    </QueryClientProvider>,
    { locale: "zh-Hans" },
  );
}

describe("ProductCategoriesPage", () => {
  beforeEach(() => {
    permissionState.role = "admin";
    listQueryFn.mockReset().mockResolvedValue(response);
    mutateAsync.mockReset().mockResolvedValue({
      success: true,
      row: response.rows[0],
      synced_records: 2,
      synced_at: "2026-07-15T03:00:00Z",
    });
  });

  it("renders material-level classification data and synchronization scope", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "产品分类设置" })).toBeInTheDocument();
    expect(await screen.findByText("3.0244")).toBeInTheDocument();
    expect(screen.getByText("黑巧系列")).toBeInTheDocument();
    expect(screen.getByText("2 条规格 · 1 个凭据")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修改分类" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "业务品类" })).toHaveTextContent("全部业务品类");
    expect(screen.getByRole("combobox", { name: "产品系列" })).toHaveTextContent("全部产品系列");
    expect(screen.getByRole("combobox", { name: "映射状态" })).toHaveTextContent("全部状态");
  });

  it("edits and synchronizes every specification for the material code", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "修改分类" }));
    const dialog = await screen.findByRole("dialog");
    const categoryInput = within(dialog).getByRole("combobox", { name: "业务品类" });
    await user.clear(categoryInput);
    await user.type(categoryInput, "礼盒巧克力");
    await user.click(screen.getByRole("button", { name: "保存并同步" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      materialCode: "3.0244",
      businessCategoryName: "礼盒巧克力",
      productSeriesName: "日常款",
    });
  });

  it("keeps classification editing read-only for regular members", async () => {
    permissionState.role = "member";
    renderPage();

    expect(await screen.findByText("仅工作区所有者和管理员可以修改分类。")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "修改分类" })).toBeDisabled();
  });
});
