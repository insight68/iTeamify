import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/client";
import { setCurrentWorkspace } from "../platform/workspace-storage";
import { OutboundEmailSchema, emailDraftFromRecord } from "./outbound-schemas";

const id = "11111111-1111-4111-8111-111111111111";
const email = {
  id, workspace_id: id, chat_session_id: id, task_id: id, lead_id: "", connection_id: id,
  from_address: "seller@example.com", to_addresses: ["buyer@example.com"], cc_addresses: [], bcc_addresses: [],
  subject: "Quote", body: "Please review", attachments: [], version: 4, status: "queued", error_code: "",
  gmail_message_id: "", created_at: "2026-09-09T10:00:00Z", sent_at: null,
};
afterEach(() => { vi.unstubAllGlobals(); setCurrentWorkspace(null, null); });

describe("outbound email API", () => {
  it("sends only the reviewed version and pins the request to its workspace", async () => {
    setCurrentWorkspace("another-workspace", "22222222-2222-4222-8222-222222222222");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(email), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const result = await new ApiClient("https://api.example.test").sendOutboundEmail(id, id, 4);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ expected_version: 4 });
    expect(new Headers(init.headers).get("X-Workspace-ID")).toBe(id);
    expect(new Headers(init.headers).get("X-Workspace-Slug")).toBe("");
    expect(result.status).toBe("queued");
    expect(result.sent_at).toBeNull();
  });
  it("never turns malformed or missing send outcomes into success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "sent" }), { status: 202 })));
    await expect(new ApiClient("https://api.example.test").sendOutboundEmail(id, id, 4)).rejects.toThrow("Invalid email response");
  });
  it("rejects malformed draft save results and degrades malformed collections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response("{}"))));
    const client = new ApiClient("https://api.example.test");
    await expect(client.updateOutboundEmail(id, id, 4, emailDraftFromRecord(email))).rejects.toThrow("Invalid email response");
    await expect(client.listOutboundEmails(id, { chat_session_id: id })).resolves.toEqual([]);
  });
  it("keeps future statuses inert and strips attachment storage keys", () => {
    const parsed = OutboundEmailSchema.parse({ ...email, status: "future-state", attachments: [{ id, filename: "quote.pdf", content_type: "application/pdf", size_bytes: 20, key: "private/key" }] });
    expect(parsed.status).toBe("future-state");
    expect(parsed.attachments[0]).not.toHaveProperty("key");
    expect(emailDraftFromRecord(parsed).attachment_ids).toEqual([id]);
  });
});
