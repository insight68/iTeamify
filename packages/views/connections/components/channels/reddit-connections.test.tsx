import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import en from "../../../locales/en/connections.json";

const mocks = vi.hoisted(() => ({
  role: "owner",
  status: "pending",
  targetVersion: "v1",
  action: vi.fn(),
  save: vi.fn(),
  open: vi.fn(),
}));
vi.mock("../../../i18n", () => ({
  useT: () => ({ t: (selector: (value: typeof en) => string) => selector(en) }),
  useDateTime: () => (value: string) => value,
}));
vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws" }));
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ user: { id: "user" } }),
    { getState: () => ({ user: { id: "user" } }) },
  ),
}));
vi.mock("@iteamify/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["members"] }),
}));
vi.mock("../../../platform", () => ({ openExternal: mocks.open }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@iteamify/core/reddit", () => ({
  redditConnectionsOptions: () => ({ queryKey: ["accounts"] }),
  redditDraftsOptions: () => ({ queryKey: ["drafts"] }),
  redditReadOptions: (_ws: string, kind: string) => ({ queryKey: [kind] }),
  useRedditConnect: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRedditDisconnect: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRedditSaveDraft: () => ({ mutateAsync: mocks.save, isPending: false }),
  useRedditDraftAction: () => ({ mutateAsync: mocks.action, isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; enabled?: boolean }) => {
    let data: unknown;
    if (options.queryKey[0] === "members")
      data = [{ user_id: "user", role: mocks.role }];
    if (options.queryKey[0] === "accounts")
      data = {
        configured: true,
        connections: [
          { id: "conn", username: "bot", status: "active", can_reply: true },
        ],
      };
    if (options.queryKey[0] === "drafts")
      data = [
        {
          id: "draft",
          connection_id: "conn",
          username: "bot",
          target_fullname: "t3_post",
          post_fullname: "t3_post",
          subreddit: "saas",
          target_version: "v1",
          body: "Exact public reply",
          version: 3,
          status: mocks.status,
          sent_fullname: "",
          error_code: "",
          expires_at: "2026-09-16",
          created_at: "2026-09-14",
        },
      ];
    if (options.queryKey[0] === "thread")
      data = {
        items: [
          {
            fullname: "t3_post",
            title: "Original question",
            body: "Context",
            can_reply: true,
            content_version: mocks.targetVersion,
          },
        ],
        partial: false,
      };
    return {
      data: options.enabled === false ? undefined : data,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
}));
import { RedditConnections } from "./reddit-connections";
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.role = "owner";
  mocks.status = "pending";
  mocks.targetVersion = "v1";
  mocks.action.mockResolvedValue({});
});
describe("Reddit human review", () => {
  it("opening review does not send; explicit confirmation uses the reviewed version", async () => {
    const user = userEvent.setup();
    render(<RedditConnections />);
    await user.click(screen.getByRole("button", { name: "Review & send" }));
    expect(mocks.action).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Exact public reply");
    await user.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(mocks.action).toHaveBeenCalledWith({
      id: "draft",
      action: "approve",
      version: 3,
      fullname: "",
    });
  });
  it("blocks confirmation after the target changed", async () => {
    mocks.targetVersion = "v2";
    const user = userEvent.setup();
    render(<RedditConnections />);
    await user.click(screen.getByRole("button", { name: "Review & send" }));
    expect(
      screen.getByRole("button", { name: "Confirm and send" }),
    ).toBeDisabled();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("does not offer approval to workspace members", () => {
    mocks.role = "member";
    render(<RedditConnections />);
    expect(
      screen.queryByRole("button", { name: "Review & send" }),
    ).not.toBeInTheDocument();
  });
  it("unknown results offer receipt verification without a send action", async () => {
    mocks.status = "unknown";
    const user = userEvent.setup();
    render(<RedditConnections />);
    await user.click(screen.getByRole("button", { name: "Verify receipt" }));
    expect(
      screen.queryByRole("button", { name: "Confirm and send" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Comment ID (t1_…)"), "t1_receipt");
    const buttons = screen.getAllByRole("button", { name: "Verify receipt" });
    await user.click(buttons[buttons.length - 1]!);
    expect(mocks.action).toHaveBeenCalledWith({
      id: "draft",
      action: "verify",
      version: 3,
      fullname: "t1_receipt",
    });
  });
});
