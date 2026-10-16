import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";
import { setCurrentWorkspace } from "../platform/workspace-storage";

afterEach(() => { vi.unstubAllGlobals(); setCurrentWorkspace(null, null); });
const other = "10000000-0000-4000-8000-000000000001";
const ws = "20000000-0000-4000-8000-000000000001";
const client = () => new ApiClient("https://example.test");

describe("private message API boundaries", () => {
  it("fails malformed message pages and send receipts instead of silently treating them as successful", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: "bad" }), { status: 200 })));
    await expect(client().listDirectMessages(ws, other, null)).rejects.toThrow("Invalid message response");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "bad" }), { status: 201 })));
    await expect(client().sendDirectMessage(ws, other, { content: "private", client_message_id: other })).rejects.toThrow("Retry to confirm delivery");
  });
  it("rejects malformed scoped session lists and isolated session metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ sessions: [{ kind: "future" }], next_cursor: null }), { status: 200 }))));
    await expect(client().listDirectSessions(ws, other, null)).rejects.toThrow("Invalid session response");
    await expect(client().listScopedAgentSessions(ws, other, null)).rejects.toThrow("Invalid session response");
    await expect(client().getDirectSession(ws, other)).rejects.toThrow("Invalid session response");
  });
  it("rejects malformed AI creation and send receipts so a retry keeps its request identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "bad" }), { status: 201 }))));
    await expect(client().createChatSession({ session_id: other, agent_id: other })).rejects.toThrow("Retry to confirm creation");
    await expect(client().sendChatMessage(other, "hello", [], other)).rejects.toThrow("Retry to confirm delivery");
  });
  it("keeps the originating workspace pinned while the active route changes", async () => {
    setCurrentWorkspace("other-workspace", "another-id");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await client().listTeamActivity(ws);
    const headers = fetch.mock.calls[0]?.[1].headers;
    expect(headers["X-Workspace-ID"]).toBe(ws);
    expect(headers["X-Workspace-Slug"]).toBe("");
  });
  it("survives an unknown contact type without exposing partially parsed identities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ target_type: "future", target_id: other }]), { status: 200 })));
    expect(await client().listTeamActivity(ws)).toEqual([]);
  });
});
