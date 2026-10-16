import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../../test/i18n";
import { ProjectsPage } from "./projects-page";

const mocks = vi.hoisted(() => ({
  query: {
    data: [] as Array<Record<string, unknown>>,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  open: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
vi.mock("@iteamify/core/projects", () => ({
  projectWorkflowsOptions: () => ({ queryKey: ["project-workflows", "ws-1"] }),
}));
vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@iteamify/core/paths", () => ({
  useWorkspacePaths: () => ({
    applications: () => "/acme/applications",
    projectDetail: (id: string) => `/acme/projects/${id}`,
  }),
}));
vi.mock("@iteamify/core/modals", () => ({
  useModalStore: Object.assign(vi.fn(), {
    getState: () => ({ open: mocks.open }),
  }),
}));
vi.mock("@iteamify/core/workspace/hooks", () => ({
  useActorName: () => ({ getActorName: () => "Alice" }),
}));
vi.mock("../../navigation", () => ({
  AppLink: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../../layout/breadcrumb-header", () => ({
  BreadcrumbHeader: ({
    segments,
    leaf,
    actions,
  }: {
    segments: Array<{ href: string; label: React.ReactNode }>;
    leaf: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <header>
      {segments.map((s) => (
        <a key={s.href} href={s.href}>
          {s.label}
        </a>
      ))}
      {leaf}
      {actions}
    </header>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.isPending = false;
  mocks.query.isError = false;
  mocks.query.data = [
    {
      id: "p1",
      title: "Market report",
      description: "Research the market",
      workflow_status: "in_review",
      lead_type: "member",
      lead_id: "u1",
    },
    { id: "p2", title: "Launch plan", workflow_status: "in_progress" },
  ];
});

describe("Projects application", () => {
  it("links back to Applications and filters projects by acceptance state", () => {
    renderWithI18n(<ProjectsPage />);
    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "href",
      "/acme/applications",
    );
    expect(screen.getByRole("link", { name: /Market report/ })).toHaveAttribute(
      "href",
      "/acme/projects/p1",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Awaiting acceptance/ }),
    );
    expect(
      screen.queryByRole("link", { name: /Launch plan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Market report/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("searches projects and opens the simplified initiation form", () => {
    renderWithI18n(<ProjectsPage />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "launch" },
    });
    expect(
      screen.queryByRole("link", { name: /Market report/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Launch plan/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(mocks.open).toHaveBeenCalledWith("create-project");
  });

  it("shows an error and retry instead of an empty successful list", () => {
    mocks.query.isError = true;
    renderWithI18n(<ProjectsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load projects.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mocks.query.refetch).toHaveBeenCalled();
  });
});
