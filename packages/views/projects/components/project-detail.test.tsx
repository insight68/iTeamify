import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../../test/i18n";
import { ProjectDetail } from "./project-detail";

const mocks = vi.hoisted(() => ({
  project: {} as Record<string, unknown>,
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => ({
    data:
      options.queryKey[0] === "workflow"
        ? mocks.project
        : options.queryKey[0] === "members"
          ? [{ user_id: "alice", name: "Alice" }]
          : [{ id: "bot", name: "Writer", archived_at: null }],
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@iteamify/core/projects", () => ({
  projectWorkflowOptions: () => ({ queryKey: ["workflow"] }),
  useProjectWorkflowAction: () => ({
    mutate: mocks.mutate,
    isPending: mocks.isPending,
    isError: false,
  }),
}));
vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@iteamify/core/paths", () => ({
  useWorkspacePaths: () => ({
    applications: () => "/acme/applications",
    projects: () => "/acme/projects",
  }),
}));
vi.mock("@iteamify/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["members"] }),
  agentListOptions: () => ({ queryKey: ["agents"] }),
}));
vi.mock("@iteamify/core/workspace/hooks", () => ({
  useActorName: () => ({ getActorName: () => "Alice" }),
}));
vi.mock("./project-resources-section", () => ({
  ProjectResourcesSection: () => <div />,
}));
vi.mock("@iteamify/ui/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("../../layout/breadcrumb-header", () => ({
  BreadcrumbHeader: ({ leaf }: { leaf: React.ReactNode }) => (
    <header>{leaf}</header>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPending = false;
  mocks.project = {
    id: "p1",
    title: "Report",
    description: "Research",
    acceptance_criteria: "Include sources",
    workflow_status: "planned",
    result: "",
    review_note: "",
    version: 3,
    can_manage: true,
    can_submit: true,
    can_review: true,
  };
});

describe("Project workflow detail", () => {
  it.each([
    ["member:alice", "member", "alice"],
    ["agent:bot", "agent", "bot"],
  ])("assigns %s through the server workflow", (value, kind, id) => {
    renderWithI18n(<ProjectDetail projectId="p1" />);
    fireEvent.change(screen.getByLabelText("Choose a person or agent"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign and start" }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { action: "assign", version: 3, assignee_type: kind, assignee_id: id },
      expect.any(Object),
    );
  });

  it("requires a deliverable to submit for acceptance", () => {
    mocks.project.workflow_status = "in_progress";
    renderWithI18n(<ProjectDetail projectId="p1" />);
    expect(
      screen.getByRole("button", { name: "Submit for acceptance" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Deliverable"), {
      target: { value: "Completed report" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for acceptance" }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      { action: "submit", version: 3, result: "Completed report" },
      expect.any(Object),
    );
  });

  it("requires rejection notes and passes the reviewed result to approval", () => {
    Object.assign(mocks.project, {
      workflow_status: "in_review",
      result: "Report v1",
    });
    renderWithI18n(<ProjectDetail projectId="p1" />);
    expect(
      screen.getByRole("button", { name: "Request changes" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Accept project" }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      { action: "approve", version: 3, note: "", result: "Report v1" },
      expect.any(Object),
    );
    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "Add sources" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      { action: "reject", version: 3, note: "Add sources" },
      expect.any(Object),
    );
  });

  it("shows the result without review actions to an executor", () => {
    Object.assign(mocks.project, {
      workflow_status: "in_review",
      result: "Report",
      can_manage: false,
      can_review: false,
    });
    renderWithI18n(<ProjectDetail projectId="p1" />);
    expect(
      screen.queryByRole("button", { name: "Accept project" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request changes" }),
    ).not.toBeInTheDocument();
  });

  it("prevents duplicate submissions while a mutation is pending", () => {
    Object.assign(mocks.project, {
      workflow_status: "in_review",
      result: "Report",
    });
    mocks.isPending = true;
    renderWithI18n(<ProjectDetail projectId="p1" />);
    expect(
      screen.getByRole("button", { name: "Accept project" }),
    ).toBeDisabled();
  });
});
