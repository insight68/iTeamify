import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MemberWithUser } from "@iteamify/core/types";
import type { SessionApplication } from "@iteamify/core/session-containers";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { NavigationProvider } from "../navigation";
import membersLocale from "../locales/en/members.json";
import settingsLocale from "../locales/en/settings.json";
import chatLocale from "../locales/en/chat.json";
import { MembersPage } from "./members-page";
import { MemberDetailPage } from "./member-detail-page";

const fixture = vi.hoisted(() => ({
  members: [] as MemberWithUser[], applications: [] as SessionApplication[],
  createMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(), revokeInvitation: vi.fn(), saveApplication: vi.fn(), deleteApplication: vi.fn(),
}));
vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws" }));
vi.mock("@iteamify/core/auth", () => {
  const state = () => ({ user: { id: "user-1" } });
  return { useAuthStore: Object.assign((selector: (s: ReturnType<typeof state>) => unknown) => selector(state()), { getState: state }) };
});
vi.mock("@iteamify/core/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@iteamify/core/paths")>();
  return { ...actual, useWorkspacePaths: () => actual.paths.workspace("acme"), useCurrentWorkspace: () => ({ id: "ws", slug: "acme", name: "Acme" }) };
});
vi.mock("@iteamify/core/api", () => {
  const api = {
    getBaseUrl: () => "",
    listMembers: vi.fn(async () => [...fixture.members]), listAgents: vi.fn(async () => []),
    listWorkspaceInvitations: vi.fn(async () => []), createMember: fixture.createMember, updateMember: fixture.updateMember, deleteMember: fixture.deleteMember, revokeInvitation: fixture.revokeInvitation,
    listSessionApplications: vi.fn(async () => ({ applications: ["conversation", "contract_review"], can_manage: fixture.members[0]?.role !== "member", providers: fixture.applications.filter((row) => row.status === "enabled"), configurations: fixture.members[0]?.role === "member" ? fixture.applications.filter((row) => row.target_id === "user-1") : fixture.applications })),
    saveSessionApplication: fixture.saveApplication, deleteSessionApplication: fixture.deleteApplication,
  };
  return { api: { ...api, withRequestContext: vi.fn(() => api) }, ApiError: class ApiError extends Error {} };
});
vi.mock("../common/actor-avatar", () => ({ ActorAvatar: () => <span data-testid="avatar" /> }));
vi.mock("../common/actor-issues-panel", () => ({ ActorIssuesPanel: ({ actorId }: { actorId: string }) => <div>Tasks for {actorId}</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const config = { service_name: "Legal review", description: "Review commercial agreements", contract_types: ["NDA"], require_background: false, require_focus: false, default_priority: "normal" as const, review_instructions: "Read clauses", result_requirements: "Give revisions", agent_instructions: "" };
const application: SessionApplication = { id: "application-1", type: "contract_review", target_kind: "member", target_id: "user-2", target_name: "Bob", status: "enabled", version: 3, config, available: true, updated_at: "2026-10-12T00:00:00Z" };

function renderPage(detail = false, userId = "user-2") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const push = vi.fn();
  render(<I18nProvider locale="en" resources={{ en: { members: membersLocale, settings: settingsLocale, chat: chatLocale } }}><NavigationProvider value={{ push, replace: vi.fn(), back: vi.fn(), pathname: detail ? `/acme/members/${userId}` : "/acme/members", searchParams: new URLSearchParams(), getShareableUrl: (path) => path }}><QueryClientProvider client={qc}>{detail ? <MemberDetailPage userId={userId} /> : <MembersPage />}</QueryClientProvider></NavigationProvider></I18nProvider>);
  return { qc, push, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.members = [
    { id: "membership-1", workspace_id: "ws", user_id: "user-1", name: "Alice", email: "alice@example.test", role: "owner", avatar_url: null, created_at: "2026-10-10T00:00:00Z" },
    { id: "membership-2", workspace_id: "ws", user_id: "user-2", name: "Bob", email: "bob@example.test", role: "member", profile_description: "Legal advisor", avatar_url: null, created_at: "2026-10-11T00:00:00Z" },
  ];
  fixture.applications = [];
  fixture.createMember.mockResolvedValue({ id: "invite" });
  fixture.updateMember.mockImplementation(async (_wsId, memberId, input) => {
    fixture.members = fixture.members.map((member) => member.id === memberId ? { ...member, role: input.role } : member);
    return fixture.members.find((member) => member.id === memberId);
  });
  fixture.deleteMember.mockImplementation(async (_wsId, memberId) => { fixture.members = fixture.members.filter((member) => member.id !== memberId); });
  fixture.saveApplication.mockImplementation(async (input, id) => {
    const saved = { ...application, id: id ?? "created", ...input, version: input.version + 1 };
    fixture.applications = [saved];
    return saved;
  });
});

describe("member management", () => {
  it("links both avatar and name to the user detail and filters by email", async () => {
    const { user, push } = renderPage();
    const name = await screen.findByRole("link", { name: "Bob" });
    const avatar = screen.getByRole("link", { name: "View Bob details" });
    expect(name).toHaveAttribute("href", "/acme/members/user-2");
    expect(avatar).toHaveAttribute("href", "/acme/members/user-2");
    await user.click(avatar);
    expect(push).toHaveBeenCalledWith("/acme/members/user-2");
    await user.type(screen.getByRole("textbox", { name: "Search name or email…" }), "bob@");
    expect(screen.queryByRole("link", { name: "Alice" })).not.toBeInTheDocument();
    expect(name).toBeVisible();
  });

  it("returns through workspace and member breadcrumbs and opens communication", async () => {
    const { user, push } = renderPage(true);
    await screen.findByRole("heading", { name: "Bob" });
    expect(screen.getByText("Legal advisor")).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Members" }));
    expect(push).toHaveBeenCalledWith("/acme/members");
    await user.click(screen.getByRole("link", { name: "Acme" }));
    expect(push).toHaveBeenCalledWith("/acme");
    await user.click(screen.getByRole("link", { name: "Message" }));
    expect(push).toHaveBeenCalledWith("/acme/chat?member=user-2&view=list");
  });

  it("updates the membership ID through the role menu", async () => {
    const { user } = renderPage(true);
    (await screen.findByRole("button", { name: "Manage Bob" })).focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("menuitem", { name: "Change role" });
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: "Admin" }));
    await waitFor(() => expect(fixture.updateMember).toHaveBeenCalledWith("ws", "membership-2", { role: "admin" }));
  });

  it("keeps the removal dialog on failure and navigates only after a successful retry", async () => {
    let reject: (reason: Error) => void = () => {};
    fixture.deleteMember.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const { user, push } = renderPage(true);
    (await screen.findByRole("button", { name: "Manage Bob" })).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("menuitem", { name: "Remove from workspace" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(push).not.toHaveBeenCalled();
    reject(new Error("request failed"));
    await screen.findByRole("alert");
    expect(dialog).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/acme/members"));
    expect(fixture.deleteMember).toHaveBeenLastCalledWith("ws", "membership-2");
  });

  it.each(["member", "admin"] as const)("hides owner management for a %s viewer", async (role) => {
    fixture.members[0]!.role = role;
    fixture.members[1]!.role = "owner";
    renderPage(true);
    await screen.findByRole("heading", { name: "Bob" });
    expect(screen.queryByRole("button", { name: "Manage Bob" })).not.toBeInTheDocument();
  });

  it("protects the last owner and self-management", async () => {
    const { user } = renderPage();
    await screen.findByRole("link", { name: "Alice" });
    expect(screen.queryByRole("button", { name: "Manage Alice" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "invitee@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(fixture.createMember).toHaveBeenCalledWith("ws", { email: "invitee@example.test", role: "member" }));
  });
});

describe("member applications", () => {
  it("scopes configurations to this member and pauses with the current version", async () => {
    fixture.applications = [application, { ...application, id: "other", target_id: "user-3", config: { ...config, service_name: "Hidden service" } }];
    const { user } = renderPage(true);
    await user.click(await screen.findByRole("tab", { name: "Applications" }));
    await screen.findByRole("heading", { name: "Legal review" });
    expect(screen.queryByText("Hidden service")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fixture.saveApplication).toHaveBeenCalledWith(expect.objectContaining({ target_id: "user-2", status: "paused", version: 3 }), "application-1"));
    await screen.findByText("Paused");
  });

  it("creates an application for the fixed member and opens a new review", async () => {
    const { user, push } = renderPage(true);
    await user.click(await screen.findByRole("tab", { name: "Applications" }));
    await user.click(await screen.findByRole("button", { name: "Add configuration" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("combobox", { name: "Service provider" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Bob")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(fixture.saveApplication).toHaveBeenCalledWith(expect.objectContaining({ target_kind: "member", target_id: "user-2", status: "enabled", version: 0 }), undefined));
    await user.click(await screen.findByRole("button", { name: "New contract review session" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/chat\?member=user-2&new=.+&container=contract_review$/));
  });

  it("lets a regular member use a published service while hiding configuration controls", async () => {
    fixture.members[0]!.role = "member";
    fixture.applications = [application];
    const { user } = renderPage(true);
    await user.click(await screen.findByRole("tab", { name: "Applications" }));
    await screen.findByRole("heading", { name: "Legal review" });
    expect(screen.queryByRole("button", { name: "Edit configuration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New contract review session" })).toBeVisible();
  });

  it("shows own configurations without allowing self-contact", async () => {
    fixture.members[0]!.role = "member";
    fixture.applications = [{ ...application, target_id: "user-1", available: false }];
    const { user } = renderPage(true, "user-1");
    await user.click(await screen.findByRole("tab", { name: "Applications" }));
    await screen.findByRole("heading", { name: "Legal review" });
    expect(screen.queryByRole("button", { name: "New contract review session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message" })).not.toBeInTheDocument();
  });
});
