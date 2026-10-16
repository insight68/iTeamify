import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enBusiness from "../../locales/en/business.json";

const mockSave = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

const context = {
  id: "context-1",
  workspace_id: "workspace-1",
  draft_revision: 4,
  published_version: 4,
  draft: {
    business_name: "Northstar Studio",
    brand_name: "",
    website_url: "https://northstar.example",
    summary: "AI operations for service businesses.",
    positioning: "A practical operating layer for online service teams.",
    differentiators: ["Business-aware AI"],
    principles: ["Human accountable"],
    exclusions: ["No invented claims"],
    offers: [{
      id: "offer-1",
      name: "AI Growth OS",
      summary: "A repeatable lead-to-delivery system.",
      outcomes: ["Qualified pipeline"],
      deliverables: ["Lead workflow"],
      typical_timeline: "6 weeks",
      pricing_note: "Scoped engagement",
      fit_notes: "Founder-led teams",
      audience_ids: ["audience-1"],
    }],
    audiences: [{
      id: "audience-1",
      name: "Founder-led consultancies",
      description: "Small expert service firms",
      industries: ["Consulting"],
      company_sizes: ["2–20"],
      geographies: ["Global"],
      pain_points: ["Inconsistent pipeline"],
      buying_triggers: ["Hiring first salesperson"],
      must_haves: ["Documented offer"],
      exclusions: [],
      priority: "core",
      buyer_personas: [{
        id: "persona-1",
        name: "Founder",
        titles: ["Founder"],
        role: "Budget owner",
        buying_role: "decision_maker",
        goals: ["Predictable growth"],
        pain_points: ["Manual research"],
        objections: ["Implementation effort"],
        channels: ["LinkedIn"],
      }],
    }],
    proof: [{ id: "proof-1", title: "Pipeline case", summary: "Demonstrated qualified meetings", source_url: "", offer_ids: ["offer-1"] }],
    sources: [],
  },
  published: null,
  has_unpublished_changes: false,
  updated_at: "2026-08-07T12:00:00Z",
  published_at: "2026-08-07T12:00:00Z",
  validation_issues: [],
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => options.queryKey[0] === "members"
    ? { data: [{ user_id: "user-1", role: "owner" }] }
    : { data: context, isPending: false, isError: false, refetch: vi.fn() },
}));

vi.mock("@iteamify/core/business", () => ({
  businessContextOptions: () => ({ queryKey: ["business"] }),
  useSaveBusinessProfile: () => ({ mutateAsync: mockSave, isPending: false }),
}));

vi.mock("@iteamify/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["members"] }),
}));

vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "workspace-1" }));
vi.mock("@iteamify/core/paths", () => ({
  useCurrentWorkspace: () => ({ id: "workspace-1", slug: "northstar", name: "Northstar Studio" }),
  useWorkspacePaths: () => ({ settings: () => "/northstar/settings", chat: () => "/northstar/chat" }),
}));
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: "user-1" } }),
}));
vi.mock("@iteamify/core/chat", () => ({ useChatStore: { getState: vi.fn() } }));
vi.mock("../../navigation", () => ({ useNavigation: () => ({ push: mockPush }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./company-management-sheet", () => ({ CompanyManagementSheet: () => null }));

vi.mock("recharts", () => {
  const Component = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Component,
    Bar: Component,
    BarChart: Component,
    CartesianGrid: Component,
    Cell: Component,
    Legend: Component,
    Pie: Component,
    PieChart: Component,
    XAxis: Component,
    YAxis: Component,
    Tooltip: Component,
  };
});

import { BusinessPage } from "./business-page";

const TEST_RESOURCES = { en: { common: enCommon, business: enBusiness } };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en" resources={TEST_RESOURCES}>{children}</I18nProvider>;
}

describe("BusinessPage — live Basic Info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue(context);
  });

  it("presents the structured dashboard without version-management controls", () => {
    render(<BusinessPage />, { wrapper: Wrapper });

    expect(screen.getByRole("heading", { name: "Northstar Studio" })).toBeInTheDocument();
    expect(screen.getByText("Service × ideal customer fit map")).toBeInTheDocument();
    expect(screen.getByText("Buying committee")).toBeInTheDocument();
    expect(screen.queryByText(/draft/i)).toBeNull();
    expect(screen.queryByText(/proposal/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("opens a direct editor and saves the current profile", async () => {
    const user = userEvent.setup();
    render(<BusinessPage />, { wrapper: Wrapper });

    await user.click(screen.getAllByRole("button", { name: "Edit company foundation" })[0]!);
    const nameInput = screen.getByLabelText("Public brand name");
    await user.clear(nameInput);
    await user.type(nameInput, "Northstar AI");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 4,
      content: expect.objectContaining({ business_name: "Northstar Studio", brand_name: "Northstar AI" }),
    }));
  });
});
