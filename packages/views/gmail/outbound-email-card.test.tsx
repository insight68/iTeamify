import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { ApiClient, setApiInstance } from "@iteamify/core/api";
import type { OutboundEmail } from "@iteamify/core/gmail";
import enConnections from "../locales/en/connections.json";
import { OutboundEmailCard } from "./outbound-email-card";

const id = "11111111-1111-4111-8111-111111111111";
const email: OutboundEmail = {
  id, workspace_id: id, chat_session_id: id, task_id: id, connection_id: id,
  from_address: "seller@example.com", to_addresses: ["buyer@example.com"], cc_addresses: [], bcc_addresses: [],
  subject: "Quote", body: "Please review this offer.", attachments: [], version: 4, status: "draft", error_code: "",
  gmail_message_id: "", created_at: "2026-09-09T10:00:00Z", sent_at: null,
};
const client = new ApiClient("https://api.example.test");
beforeEach(() => setApiInstance(client));
const resources = { en: { connections: enConnections } };
afterEach(() => vi.restoreAllMocks());
function view(record: OutboundEmail, readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><I18nProvider locale="en" resources={resources}><OutboundEmailCard email={record} readOnly={readOnly} /></I18nProvider></QueryClientProvider>;
}

describe("email review card", () => {
  it("shows exact recipients and sends the displayed version with one click", async () => {
    const send = vi.spyOn(client, "sendOutboundEmail").mockResolvedValue({ ...email, status: "queued" });
    render(view(email));
    expect(screen.getByText("seller@example.com")).toBeTruthy();
    expect(screen.getByText("buyer@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(id, id, 4));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Sent")).toBeNull();
  });
  it.each(["queued", "sending", "sent", "failed", "unknown", "future-state"])("cannot send or edit %s content", (status) => {
    render(view({ ...email, status }));
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("warns about uncertain delivery without providing a retry action", () => {
    render(view({ ...email, status: "unknown" }));
    expect(screen.getByText(/Check Sent in Gmail/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("uses the same record as a read-only customer communication", () => {
    render(view(email, true));
    expect(screen.getByText(email.body)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
  it("saves an edited draft without sending", async () => {
    vi.spyOn(client, "listGmailConnections").mockResolvedValue({ configured: true, analysis_configured: true, connections: [] });
    const save = vi.spyOn(client, "updateOutboundEmail").mockResolvedValue({ ...email, subject: "Revised quote", version: 5 });
    const send = vi.spyOn(client, "sendOutboundEmail");
    render(view(email));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Revised quote" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(id, id, 4, expect.objectContaining({ subject: "Revised quote", cc_addresses: [], bcc_addresses: [] })));
    expect(send).not.toHaveBeenCalled();
  });
});
