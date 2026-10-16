import { fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSlugProvider } from "@iteamify/core/paths";
import { teamKeys } from "@iteamify/core/team";
import { workspaceKeys } from "@iteamify/core/workspace/queries";
import { SidebarProvider } from "@iteamify/ui/components/ui/sidebar";
import { NavigationProvider } from "../navigation";
import { renderWithI18n } from "../test/i18n";
import { TeamSidebarGroup } from "./team-sidebar-group";

vi.mock("@iteamify/core/api", () => ({ api: { getBaseUrl: () => "" } }));
vi.mock("@iteamify/core/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "me" } }),
}));

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

function renderTeam(search = "", hasHistory = true) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  client.setQueryData(workspaceKeys.list(), [{ id: "ws", slug: "acme", name: "Acme" }]);
  client.setQueryData(workspaceKeys.members("ws"), [
    { id: "membership-me", user_id: "me", name: "Me", role: "owner", avatar_url: null },
    { id: "membership-bob", user_id: "bob", name: "Bob", role: "member", avatar_url: null },
  ]);
  client.setQueryData(workspaceKeys.agents("ws"), [
    { id: "assistant", name: "Assistant", avatar_url: null, owner_id: "me", permission_mode: "private", invocation_targets: [] },
  ]);
  client.setQueryData(teamKeys.activity("ws", "me"), hasHistory ? [
    { target_type: "member", target_id: "bob", resume_session_id: "topic-bob", has_unread: true, last_contact_at: null },
    { target_type: "agent", target_id: "assistant", resume_session_id: "topic-agent", has_unread: false, last_contact_at: null },
  ] : []);
  const push = vi.fn();
  renderWithI18n(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider slug="acme">
        <NavigationProvider value={{ pathname: "/acme/chat", searchParams: new URLSearchParams(search), push, replace: vi.fn(), back: vi.fn(), getShareableUrl: (path) => path }}>
          <SidebarProvider><TeamSidebarGroup /></SidebarProvider>
        </NavigationProvider>
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
  return { push };
}

describe("team member navigation", () => {
  it.each([
    "",
    "member=bob&session=topic-bob&container=contract_review",
    "member=bob&new=draft-bob",
    "member=bob&view=list",
    "member=someone-else&session=other-topic",
  ])("opens the topic list from the member row and message action (%s)", (search) => {
    const { push } = renderTeam(search);
    const member = screen.getByRole("link", { name: /^Bob/ });
    const message = screen.getByRole("link", { name: "Message Bob" });
    const href = "/acme/chat?member=bob&view=list";
    expect(member).toHaveAttribute("href", href);
    expect(message).toHaveAttribute("href", href);
    expect(member.hasAttribute("data-active")).toBe(new URLSearchParams(search).get("member") === "bob");
    fireEvent.click(member);
    fireEvent.click(message);
    expect(push.mock.calls).toEqual([[href], [href]]);
  });

  it("opens the list using the user's id when the member has no history", () => {
    renderTeam("", false);
    expect(screen.getByRole("link", { name: /^Bob/ })).toHaveAttribute("href", "/acme/chat?member=bob&view=list");
  });

  it("keeps agent resume and active-session navigation", () => {
    renderTeam();
    expect(screen.getByRole("link", { name: /^Assistant/ })).toHaveAttribute("href", "/acme/chat?agent=assistant&session=topic-agent");
  });

  it("preserves the current agent topic when clicking an active agent", () => {
    renderTeam("agent=assistant&session=another-topic");
    const agent = screen.getByRole("link", { name: /^Assistant/ });
    expect(agent).toHaveAttribute("href", "/acme/chat?agent=assistant&session=another-topic");
    expect(agent).toHaveAttribute("data-active");
  });
});
