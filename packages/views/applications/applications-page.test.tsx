import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithI18n } from "../test/i18n";
import { ApplicationsPage } from "./applications-page";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { configurations: [], providers: [], can_manage: false },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ user: { id: "user-1" } }),
    { getState: () => ({}) },
  ),
}));
vi.mock("@iteamify/core/paths", () => ({
  useWorkspacePaths: () => ({ projects: () => "/acme/projects" }),
}));
vi.mock("@iteamify/core/session-containers", () => ({
  applicationsOptions: () => ({}),
  useSaveApplication: () => ({ isPending: false, isError: false }),
  useDeleteApplication: () => ({ isPending: false, isError: false }),
}));
vi.mock("../layout/page-header", () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
}));
vi.mock("../navigation", () => ({
  AppLink: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("Projects application entry", () => {
  it("is available to workspace members alongside existing applications", () => {
    renderWithI18n(<ApplicationsPage />);
    expect(screen.getByRole("link", { name: "Open projects" })).toHaveAttribute(
      "href",
      "/acme/projects",
    );
    expect(
      screen.getByText("Initiate → Assign → Execute → Review"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contract review" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Manage configuration" }),
    ).not.toBeInTheDocument();
  });
});
