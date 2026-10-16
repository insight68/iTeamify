import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@iteamify/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enSettings from "../../locales/en/settings.json";

const mockUpdateWorkspace = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());
const workspaceRef = vi.hoisted(() => ({
  current: {
    id: "workspace-1",
    name: "Northstar Studio",
    slug: "northstar",
    description: "",
    context: "",
    settings: {},
    repos: [],
    issue_prefix: "NOR",
    avatar_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
}));
const membersRef = vi.hoisted(() => ({
  current: [{ user_id: "user-1", role: "owner" as "owner" | "admin" | "member" }],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: membersRef.current, isFetched: true }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => [workspaceRef.current]),
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("@iteamify/core/paths", () => ({
  useCurrentWorkspace: () => workspaceRef.current,
  useHasOnboarded: () => true,
  resolvePostAuthDestination: () => "/",
}));

vi.mock("@iteamify/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["members"] }),
  workspaceKeys: { list: () => ["workspaces"] },
  workspaceListOptions: () => ({ queryKey: ["workspaces"] }),
}));

vi.mock("@iteamify/core/issues/queries", () => ({ issueKeys: { all: (id: string) => ["issues", id] } }));
vi.mock("@iteamify/core/workspace/mutations", () => ({
  useLeaveWorkspace: () => ({ mutateAsync: vi.fn() }),
  useDeleteWorkspace: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@iteamify/core/platform", () => ({ setCurrentWorkspace: vi.fn() }));
vi.mock("@iteamify/core/api", () => ({ api: { updateWorkspace: mockUpdateWorkspace } }));
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: "user-1" } }),
}));
vi.mock("../../navigation", () => ({ useNavigation: () => ({ push: mockPush }) }));
vi.mock("../../common/avatar-upload-control", () => ({ AvatarUploadControl: () => <button type="button">Logo upload</button> }));
vi.mock("../../settings/components/delete-workspace-dialog", () => ({ DeleteWorkspaceDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CompanyManagementSheet } from "./company-management-sheet";

const TEST_RESOURCES = { en: { common: enCommon, settings: enSettings } };

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en" resources={TEST_RESOURCES}>{children}</I18nProvider>;
}

describe("CompanyManagementSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membersRef.current = [{ user_id: "user-1", role: "owner" }];
    workspaceRef.current = {
      ...workspaceRef.current,
      name: "Northstar Studio",
      slug: "northstar",
      issue_prefix: "NOR",
    };
    mockUpdateWorkspace.mockImplementation(async (_id: string, input: Record<string, unknown>) => ({
      ...workspaceRef.current,
      ...input,
    }));
  });

  it("keeps company identity and system identifiers on the Basic Info surface", () => {
    render(<CompanyManagementSheet open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByRole("heading", { name: "Manage company" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Northstar Studio");
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveValue("northstar");
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveAttribute("readonly");
  });

  it("saves the canonical workspace name on blur", async () => {
    const user = userEvent.setup();
    render(<CompanyManagementSheet open onOpenChange={vi.fn()} />, { wrapper: Wrapper });
    const input = screen.getByRole("textbox", { name: "Name" });

    await user.clear(input);
    await user.type(input, "Northstar Company");
    await user.tab();

    await waitFor(() => expect(mockUpdateWorkspace).toHaveBeenCalledWith("workspace-1", { name: "Northstar Company" }));
  });

  it("normalizes and confirms an issue prefix before saving", async () => {
    const user = userEvent.setup();
    render(<CompanyManagementSheet open onOpenChange={vi.fn()} />, { wrapper: Wrapper });
    const input = screen.getByRole("textbox", { name: "Issue prefix" });

    await user.clear(input);
    await user.type(input, "ab-12!");
    expect(input).toHaveValue("AB12");
    await user.tab();

    expect(mockUpdateWorkspace).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mockUpdateWorkspace).toHaveBeenCalledWith("workspace-1", { issue_prefix: "AB12" }));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["issues", "workspace-1"] });
  });

  it("keeps identity and prefix read-only for regular members", () => {
    membersRef.current = [{ user_id: "user-1", role: "member" }];
    render(<CompanyManagementSheet open onOpenChange={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Issue prefix" })).toBeDisabled();
  });
});
