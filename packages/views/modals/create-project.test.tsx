import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../test/i18n";
import { CreateProjectModal } from "./create-project";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  clearDraft: vi.fn(),
  setDraft: vi.fn(),
  push: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@iteamify/core/projects", () => ({
  useCreateProject: () => ({
    mutate: mocks.mutate,
    isPending: false,
    isError: false,
  }),
  useProjectDraftStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        draft: { title: "", description: "", acceptanceCriteria: "" },
        clearDraft: mocks.clearDraft,
        setDraft: mocks.setDraft,
      }),
    { getState: () => ({}) },
  ),
}));
vi.mock("@iteamify/core/paths", () => ({
  useWorkspacePaths: () => ({
    projectDetail: (id: string) => `/acme/projects/${id}`,
  }),
}));
vi.mock("../navigation", () => ({
  useNavigation: () => ({ push: mocks.push }),
}));

beforeEach(() => vi.clearAllMocks());

describe("Project initiation", () => {
  it("requires acceptance criteria and waits for server confirmation before navigating", () => {
    renderWithI18n(<CreateProjectModal onClose={mocks.close} />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Report" },
    });
    expect(
      screen.getByRole("button", { name: "Create project" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Goal and background"), {
      target: { value: "Research market" },
    });
    fireEvent.change(screen.getByLabelText("Acceptance criteria"), {
      target: { value: "Include sources" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        title: "Report",
        description: "Research market",
        acceptance_criteria: "Include sources",
      },
      expect.any(Object),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    mocks.mutate.mock.calls[0]![1].onSuccess({ id: "p1" });
    expect(mocks.clearDraft).toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/acme/projects/p1");
  });

  it("persists acceptance criteria in the draft", () => {
    renderWithI18n(<CreateProjectModal onClose={mocks.close} />, {
      locale: "zh-Hans",
    });
    fireEvent.change(screen.getByLabelText("验收标准"), {
      target: { value: "包含数据来源" },
    });
    expect(mocks.setDraft).toHaveBeenLastCalledWith({
      title: "",
      description: "",
      acceptanceCriteria: "包含数据来源",
    });
    expect(screen.queryByText("优先级")).not.toBeInTheDocument();
  });
});
