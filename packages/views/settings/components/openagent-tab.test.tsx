import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@iteamify/core/i18n/react";
import { ApiError, setApiInstance, type ApiClient } from "@iteamify/core/api";
import type { WorkspaceOpenAgentConfigInput } from "@iteamify/core/types";
import enSettings from "../../locales/en/settings.json";
import { OpenAgentTab } from "./openagent-tab";
import { toast } from "sonner";
const actor = vi.hoisted(() => ({ role: "owner" as "owner" | "admin" | "member", wsId: "workspace-a" }));
vi.mock("@iteamify/core/paths", () => ({ useCurrentWorkspace: () => ({ id: actor.wsId }) }));
vi.mock("@iteamify/core/auth", () => ({ useAuthStore: Object.assign((selector: (state: unknown) => unknown) => selector({ user: { id: "owner-user" } }), { getState: () => ({ user: { id: "owner-user" } }) }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const config = { configured: true, revision: 1, base_url: "https://provider.example.com/anthropic", model: "model-a", credential_configured: true, updated_at: null };
let save: ReturnType<typeof vi.fn>;
let testConnection: ReturnType<typeof vi.fn>;
function mount() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={qc}><I18nProvider locale="en" resources={{ en: { settings: enSettings } }}><OpenAgentTab /></I18nProvider></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); testConnection = vi.fn(async () => {}); actor.role = "owner"; actor.wsId = "workspace-a"; save = vi.fn(async (_id: string, input: WorkspaceOpenAgentConfigInput) => ({ ...config, revision: 2, model: input.model })); setApiInstance({ withRequestContext() { return this; }, listMembers: async () => [{ user_id: "owner-user", role: actor.role }], getWorkspaceOpenAgentConfig: async () => config, updateWorkspaceOpenAgentConfig: save, testWorkspaceOpenAgentConfig: testConnection } as unknown as ApiClient); });
describe("workspace OpenAgent settings", () => {
 it("saves only this workspace and preserves a hidden key when input is blank", async () => { const user = userEvent.setup(); mount(); const model = await screen.findByLabelText("Model ID"); await waitFor(() => expect(model).toHaveValue("model-a")); const key = screen.getByLabelText("API key"); expect(key).toHaveValue(""); await user.clear(model); await user.type(model, "new-model"); await user.click(screen.getByRole("button", { name: "Save" })); await waitFor(() => expect(save).toHaveBeenCalledWith("workspace-a", { expected_revision: 1, base_url: config.base_url, model: "new-model" })); expect(key).toHaveValue(""); });
 it.each(["admin", "member"] as const)("keeps %s read-only and hides credential editing", async role => { actor.role = role; mount(); expect(await screen.findByText("Only the workspace owner can change this configuration.")).toBeInTheDocument(); await waitFor(() => expect(screen.getByLabelText("Model ID")).toHaveValue("model-a")); expect(screen.getByLabelText("Model ID")).toBeDisabled(); expect(screen.queryByLabelText("API key")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument(); expect(save).not.toHaveBeenCalled(); });
});


describe("OpenAgent connection failure feedback", () => {
  it("shows the DNS policy failure in the form and resets it when edited", async () => {
    testConnection.mockRejectedValue(new ApiError("safe diagnostic", 422, "Connection test failed", { ok: false, code: "network_policy", error: "safe diagnostic" }));
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByLabelText("Model ID")).toHaveValue("model-a"));
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(enSettings.openagent.test_network_policy);
    expect(toast.error).toHaveBeenCalledWith(enSettings.openagent.test_network_policy);
    expect(testConnection).toHaveBeenCalledWith("workspace-a", { expected_revision: 1, base_url: config.base_url, model: "model-a" });
    await user.type(screen.getByLabelText("Model ID"), "-edited");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("uses a generic message for unknown failure codes", async () => {
    testConnection.mockRejectedValue(new ApiError("unknown", 422, "Connection test failed", { ok: false, code: "future_failure", error: "unknown" }));
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByLabelText("Model ID")).toHaveValue("model-a"));
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(enSettings.openagent.test_error);
  });
});
