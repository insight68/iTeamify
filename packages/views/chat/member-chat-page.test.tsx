// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { useDirectDraftStore } from "@iteamify/core/team";
import enChat from "../locales/en/chat.json";
import enCommon from "../locales/en/common.json";
import { MemberChatPage } from "./member-chat-page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), send: vi.fn(), read: vi.fn(), members: vi.fn(), sessions: vi.fn(), session: vi.fn(), replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("@iteamify/core/api", () => ({ api: {
    withRequestContext() { return this; }, getBaseUrl: () => "", listDirectSessions: mocks.sessions, getDirectSession: mocks.session, listDirectMessages: mocks.list, sendDirectMessage: mocks.send, markDirectMessagesRead: mocks.read, listMembers: mocks.members } }));
vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws" }));
vi.mock("@iteamify/core/auth", () => ({ useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: "me" } }) }));
vi.mock("../common/use-app-foreground", () => ({ useAppForeground: () => true }));
vi.mock("../layout/page-header", () => ({ PageHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header> }));

vi.mock("@iteamify/core/paths", () => ({ useWorkspacePaths: () => ({ chat: () => "/acme/chat", memberDetail: (id: string) => `/acme/members/${id}` }) }));
vi.mock("../navigation", () => ({ AppLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useNavigation: () => ({ searchParams: mocks.search, replace: mocks.replace }) }));
vi.mock("./components/chat-shell", () => ({ ChatShell: ({ listHeader, listBody, content }: { listHeader: React.ReactNode; listBody: React.ReactNode; content: React.ReactNode }) => <div>{listHeader}{listBody}{content}</div> }));
const page = { messages: [], has_more: false, next_cursor: null, read_sequence: 0, can_send: true };
let qc: QueryClient;
function tree(other: string, session: string | null = `session-${other}`) { mocks.search = new URLSearchParams(session ? { member: other, session } : { member: other, view: "list" }); return <QueryClientProvider client={qc}><I18nProvider locale="en" resources={{ en: { common: enCommon, chat: enChat } }}><MemberChatPage userId={other} /></I18nProvider></QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  useDirectDraftStore.getState().clearDraft();
  mocks.list.mockResolvedValue(page);
  mocks.sessions.mockResolvedValue({ sessions: [], next_cursor: null });
  mocks.session.mockImplementation((_ws: string, id: string) => Promise.resolve({ id, peer_user_id: id.includes("bob") ? "bob" : "alice" }));
  mocks.read.mockResolvedValue(undefined);
  mocks.members.mockResolvedValue([{ user_id: "alice", name: "Alice", avatar_url: null }, { user_id: "bob", name: "Bob", avatar_url: null }]);
});
afterEach(() => qc.clear());

describe("member private conversation", () => {
  it.each([false, true])("keeps the explicit topic list without opening or creating a session (history: %s)", async (hasHistory) => {
    mocks.sessions.mockResolvedValue({ sessions: hasHistory ? [{ id: "session-alice", title: "Existing topic", has_unread: false, last_message_at: null, last_message_content: "" }] : [], next_cursor: null });
    render(tree("alice", null));
    await screen.findByRole("heading", { name: "Conversation topics with Alice" });
    if (hasHistory) await screen.findByRole("button", { name: "Existing topic" });
    await waitFor(() => expect(mocks.sessions).toHaveBeenCalled());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    if (hasHistory) {
      fireEvent.click(screen.getByRole("button", { name: "Existing topic" }));
      expect(mocks.replace).toHaveBeenCalledWith("/acme/chat?member=alice&session=session-alice");
    }
  });

  it("keeps each person's draft when switching conversations", async () => {
    const view = render(tree("alice"));
    await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Draft for Alice" } });
    view.rerender(tree("bob"));
    await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
    expect(screen.getByRole("textbox")).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Draft for Bob" } });
    view.rerender(tree("alice"));
    expect(screen.getByRole("textbox")).toHaveValue("Draft for Alice");
  });
  it("shows a failed message and retries with the same client key", async () => {
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    render(tree("alice"));
    await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Message not sent");
    expect(screen.getByText("Hello")).toBeInTheDocument();
    const data = mocks.send.mock.calls[0]?.[2];
    mocks.send.mockResolvedValueOnce({ session: { id: "session-alice", peer_user_id: "alice" }, message: { chat_session_id: "session-alice", id: "server-id", sender_id: "me", client_message_id: data.client_message_id, content: "Hello", sequence: 1, created_at: "2026-10-09T01:00:00Z" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    expect(mocks.send.mock.calls[1]?.[2]).toEqual(data);
  });
  it("preserves received content as text and disables sending when the member leaves", async () => {
    mocks.list.mockResolvedValue({ ...page, can_send: false, messages: [{ id: "message", sender_id: "alice", client_message_id: "client", sequence: 1, content: "<script>unsafe()</script>", created_at: "2026-10-09T01:00:00Z" }] });
    const { container } = render(tree("alice"));
    await screen.findByText("<script>unsafe()</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("isolates drafts between sessions with the same person", async () => {
    const view = render(tree("alice"));
    await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Topic one" } });
    view.rerender(tree("alice", "session-alice-two"));
    await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
    expect(screen.getByRole("textbox")).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Topic two" } });
    view.rerender(tree("alice"));
    expect(screen.getByRole("textbox")).toHaveValue("Topic one");
  });
  it("does not fetch a transcript for a session belonging to another person", async () => {
    mocks.session.mockResolvedValue({ id: "session-alice", peer_user_id: "bob" });
    render(tree("alice"));
    await screen.findByRole("alert");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

});
