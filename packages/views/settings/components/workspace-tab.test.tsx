import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTab } from "./workspace-tab";

const {
  setQueryData,
  memberRoleRef,
  toastError,
  toastSuccess,
  updateWorkspace,
  workspaceRef,
} = vi.hoisted(() => ({
  memberRoleRef: { current: "owner" as "owner" | "admin" | "member" },
  setQueryData: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateWorkspace: vi.fn(),
  workspaceRef: {
    current: {
      id: "ws-1",
      name: "Acme",
      slug: "acme",
      description: "Builds useful things",
      context: "Use concise updates",
      settings: {
        theme: "quiet",
        modules: {
          projects: {
            default_view: "list",
          },
        },
        navigation: {
          sidebar: {
            inbox: {
              unread_badge: true,
            },
          },
        },
        reconciliation: {
          default_filter: { platform: "shop" },
        },
      } as Record<string, unknown>,
      repos: [],
      issue_prefix: "ACM",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  },
}));

vi.mock("@teamify/ui/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

vi.mock("@teamify/ui/components/ui/alert-dialog", () => ({
  AlertDialog: () => null,
  AlertDialogAction: () => null,
  AlertDialogCancel: () => null,
  AlertDialogContent: () => null,
  AlertDialogDescription: () => null,
  AlertDialogFooter: () => null,
  AlertDialogHeader: () => null,
  AlertDialogTitle: () => null,
}));

vi.mock("./delete-workspace-dialog", () => ({
  DeleteWorkspaceDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

vi.mock("@teamify/core/api", () => ({
  api: {
    updateWorkspace,
  },
}));

vi.mock("@teamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "user-1" } }),
}));

vi.mock("@teamify/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@teamify/core/paths", () => ({
  resolvePostAuthDestination: () => "/acme/issues",
  useCurrentWorkspace: () => workspaceRef.current,
  useHasOnboarded: () => true,
}));

vi.mock("@teamify/core/platform", () => ({
  setCurrentWorkspace: vi.fn(),
}));

vi.mock("@teamify/core/workspace/mutations", () => ({
  useDeleteWorkspace: () => ({ mutateAsync: vi.fn() }),
  useLeaveWorkspace: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../navigation", () => ({
  useNavigation: () => ({ push: vi.fn() }),
}));

vi.mock("../../i18n", () => ({
  useT: () => ({
    t: (
      selector: (resources: { workspace: Record<string, string> }) => string,
      vars?: Record<string, string>,
    ) => {
      const value = selector({
        workspace: {
          section_general: "Team Workspace",
          section_modules: "Workspace Navigation",
          name_label: "Name",
          description_label: "Description",
          description_placeholder: "Description",
          context_label: "Context",
          context_placeholder: "Context",
          slug_label: "Slug",
          save: "Save",
          saving: "Saving...",
          manage_hint: "Only workspace owners can update workspace settings.",
          issues_nav_title: "Issues",
          issues_nav_description: "Show issues in the left navigation.",
          projects_nav_title: "Projects",
          projects_nav_description: "Show projects in the left navigation.",
          reconciliation_nav_title: "Reconciliation",
          reconciliation_nav_description: "Show in the left navigation.",
          supply_reconciliation_nav_title: "Supply Fee Reconciliation",
          supply_reconciliation_nav_description: "Show supply fee reconciliation in the left navigation.",
          inventory_nav_title: "Inventory",
          inventory_nav_description: "Show inventory in the left navigation.",
          product_categories_nav_title: "Product Categories",
          product_categories_nav_description: "Show product categories in the left navigation.",
          inbox_nav_title: "Inbox",
          inbox_nav_description: "Show inbox in the left navigation.",
          my_issues_nav_title: "My Issues",
          my_issues_nav_description: "Show my issues in the left navigation.",
          create_issue_nav_title: "New Issue",
          create_issue_nav_description: "Show new issue in the left navigation.",
          search_nav_title: "Search",
          search_nav_description: "Show search in the left navigation.",
          module_nav_label: "Show in sidebar",
          toast_saved: "Workspace settings saved",
          toast_save_failed: "Failed to save workspace settings",
          danger_zone: "Danger Zone",
          leave_title: "Leave workspace",
          leave_sole_owner: "Sole owner",
          leave_sole_member: "Sole member",
          leave_default: "Leave this workspace.",
          leave_button: "Leave workspace",
          leaving: "Leaving...",
          leave_confirm_title: "Leave workspace",
          leave_confirm_description: "Leave {{name}}?",
          toast_leave_failed: "Failed to leave workspace",
          delete_title: "Delete workspace",
          delete_description: "Delete this workspace.",
          delete_button: "Delete workspace",
          deleting: "Deleting...",
          toast_delete_failed: "Failed to delete workspace",
          confirm_cancel: "Cancel",
          confirm_action: "Confirm",
        },
      });
      if (!vars) return value;
      return Object.entries(vars).reduce(
        (next, [key, replacement]) => next.replace(`{{${key}}}`, replacement),
        value,
      );
    },
  }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({
    data: [
      {
        id: "member-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        role: memberRoleRef.current,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    isFetched: true,
  }),
  useQueryClient: () => ({
    getQueryData: vi.fn(() => [workspaceRef.current]),
    setQueryData,
  }),
}));

describe("WorkspaceTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberRoleRef.current = "owner";
    workspaceRef.current = {
      ...workspaceRef.current,
      settings: {
        theme: "quiet",
        modules: {
          projects: {
            default_view: "list",
          },
        },
        navigation: {
          sidebar: {
            inbox: {
              unread_badge: true,
            },
          },
        },
        reconciliation: {
          default_filter: { platform: "shop" },
        },
      },
    };
    updateWorkspace.mockImplementation(async (_id, updates) => ({
      ...workspaceRef.current,
      ...updates,
    }));
  });

  it("uses navigation visibility defaults", () => {
    workspaceRef.current = {
      ...workspaceRef.current,
      settings: {},
    };

    render(<WorkspaceTab />);

    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(10);
    expect(toggles[0]!).toHaveAttribute("aria-checked", "true");
    expect(toggles[1]!).toHaveAttribute("aria-checked", "true");
    expect(toggles[2]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[3]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[4]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[5]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[6]!).toHaveAttribute("aria-checked", "true");
    expect(toggles[7]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[8]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[9]!).toHaveAttribute("aria-checked", "false");
  });

  it("saves navigation visibility without dropping other settings", async () => {
    const user = userEvent.setup();
    render(<WorkspaceTab />);

    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]!).toHaveAttribute("aria-checked", "true");
    expect(toggles[1]!).toHaveAttribute("aria-checked", "true");
    expect(toggles[2]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[3]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[4]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[5]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[6]!).toHaveAttribute("aria-checked", "true");
    expect(toggles[7]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[8]!).toHaveAttribute("aria-checked", "false");
    expect(toggles[9]!).toHaveAttribute("aria-checked", "false");

    await user.click(toggles[0]!);
    await user.click(toggles[2]!);
    await user.click(toggles[6]!);
    await user.click(toggles[8]!);
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    await user.click(saveButtons[1]!);

    expect(updateWorkspace).toHaveBeenCalledWith("ws-1", {
      settings: {
        theme: "quiet",
        modules: {
          issues: {
            nav_visible: false,
          },
          projects: {
            default_view: "list",
            nav_visible: true,
          },
          reconciliation: {
            nav_visible: true,
          },
          supplyReconciliation: {
            nav_visible: false,
          },
          inventory: {
            nav_visible: false,
          },
          productCategories: {
            nav_visible: false,
          },
        },
        navigation: {
          sidebar: {
            inbox: {
              unread_badge: true,
              nav_visible: false,
            },
            myIssues: {
              nav_visible: false,
            },
            createIssue: {
              nav_visible: true,
            },
            search: {
              nav_visible: false,
            },
          },
        },
        reconciliation: {
          default_filter: { platform: "shop" },
        },
      },
    });
    expect(setQueryData).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Workspace settings saved");
  });

  it("does not allow admins to edit workspace configuration", () => {
    memberRoleRef.current = "admin";

    render(<WorkspaceTab />);

    for (const toggle of screen.getAllByRole("switch")) {
      expect(toggle).toBeDisabled();
    }

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    expect(saveButtons[0]).toBeDisabled();
    expect(saveButtons[1]).toBeDisabled();
  });
});
