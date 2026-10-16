import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithI18n } from "../test/i18n";
import { NavigationProvider } from "../navigation";
import type { NavigationAdapter } from "../navigation";
import { BillingPage } from "./billing-page";

const state = vi.hoisted(() => ({ role: "owner" as "owner" | "member", balance: 1000 }));

vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "workspace-1" }));
vi.mock("@iteamify/core/permissions", () => ({
  useCurrentMember: () => ({ role: state.role, isLoading: false }),
}));
vi.mock("@iteamify/core/billing", () => ({
  billingBalanceOptions: () => ({ queryKey: ["billing", "balance"] }),
  billingPriceTiersOptions: () => ({ queryKey: ["billing", "tiers"] }),
  billingTransactionsOptions: () => ({ queryKey: ["billing", "transactions"] }),
  billingTopupsOptions: () => ({ queryKey: ["billing", "topups"] }),
  billingCheckoutSessionOptions: () => ({ queryKey: ["billing", "session"] }),
  useCreateCloudBillingCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInvalidateBillingDataAfterCredit: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    const kind = options.queryKey[1];
    if (kind === "balance") return { data: { balance_credit: state.balance }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
    if (kind === "tiers") return { data: [
      { id: "1000", display_name: "USD 10", amount_cents: 1000, credits: 1000 },
      { id: "5000", display_name: "USD 50", amount_cents: 5000, credits: 5000 },
    ], isLoading: false, isError: false };
    return { data: { items: [] }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
  },
}));

const navigation: NavigationAdapter = {
  push: vi.fn(), replace: vi.fn(), back: vi.fn(), pathname: "/acme/billing",
  searchParams: new URLSearchParams(), getShareableUrl: (path) => path,
};

function renderPage(locale: "en" | "zh-Hans" = "en") {
  return renderWithI18n(<NavigationProvider value={navigation}><BillingPage /></NavigationProvider>, { locale });
}

afterEach(() => { cleanup(); state.role = "owner"; state.balance = 1000; });

describe("BillingPage", () => {
  it("presents equal-rate amounts as selectable options with one payment action", async () => {
    const user = userEvent.setup();
    renderPage("en");
    const choices = screen.getByRole("radiogroup", { name: "Credit amount" });
    const options = within(choices).getAllByRole("radio");
    expect(options).toHaveLength(2);
    expect(options[0]!).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("button", { name: "Continue to payment" })).toHaveLength(1);
    expect(screen.queryByText(/bonus|best value|subscription/i)).not.toBeInTheDocument();
    await user.click(options[1]!);
    expect(options[1]!).toHaveAttribute("aria-checked", "true");
  });

  it("keeps a member read-only while showing the shared balance", () => {
    state.role = "member";
    renderPage("zh-Hans");
    expect(screen.getByText("1,000.00")).toBeInTheDocument();
    expect(screen.getByText("仅工作区所有者和管理员可以充值积分。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续支付" })).not.toBeInTheDocument();
  });

  it("shows a clear warning for a negative workspace balance", () => {
    state.balance = -12.5;
    renderPage("zh-Hans");
    expect(screen.getByText("-12.50")).toHaveClass("text-destructive");
    expect(screen.getByText(/已用完可用额度/)).toBeInTheDocument();
  });
});
