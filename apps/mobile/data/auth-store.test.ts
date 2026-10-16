import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@iteamify/core/types";
vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } }));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("./api", () => ({
  api: { setToken: vi.fn(), getMe: vi.fn(), verifyCode: vi.fn() },
  ApiError: class extends Error { status = 401; },
}));
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import { useAuthStore } from "./auth-store";
import { queryClient } from "./query-client";
import { useWorkspaceStore } from "./workspace-store";
import { chatDraftKey, useChatDraftsStore } from "./stores/chat-drafts-store";
import { useMentionDraftStore } from "./stores/mention-draft-store";
import { useFailedCommentsStore } from "./stores/failed-comments-store";

describe("account transitions", () => {
  beforeEach(async () => {
    vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    vi.mocked(SecureStore.setItemAsync).mockResolvedValue();
    await useAuthStore.getState().logout();
  });

  it("clears private data synchronously even when credential deletion fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await useWorkspaceStore.getState().setCurrentWorkspace("ws", "workspace");
    const retired = queryClient;
    retired.setQueryData(["private"], { owner: "A" });
    useAuthStore.getState().setUser({ id: "A" } as User);
    useChatDraftsStore.getState().setDraft(chatDraftKey("ws", "chat"), "private text");
    useMentionDraftStore.getState().toggle({ type: "member", id: "A", name: "A" });
    useFailedCommentsStore.getState().markFailed("failed", { content: "private", error: "offline" });
    vi.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error("locked"));
    const logout = useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useWorkspaceStore.getState().currentWorkspaceId).toBeNull();
    expect(useChatDraftsStore.getState().drafts).toEqual({});
    expect(useMentionDraftStore.getState().mentions).toEqual([]);
    expect(useFailedCommentsStore.getState().failed).toEqual({});
    expect(queryClient).not.toBe(retired);
    // Mutation callbacks can outlive logout, but retain their old QueryClient.
    retired.setQueryData(["private"], { owner: "late A" });
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
    await logout;
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
    retired.clear();
  });

  it("does not let a delayed initialization overwrite a subsequent login", async () => {
    let finish!: (user: User) => void;
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => key === "iteamify_token" ? "old-token" : null);
    vi.mocked(api.getMe).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const initialization = useAuthStore.getState().initialize();
    await vi.waitFor(() => expect(finish).toBeDefined());
    const userB = { id: "B", name: "B" } as User;
    vi.mocked(api.verifyCode).mockResolvedValue({ token: "new-token", user: userB });
    await useAuthStore.getState().verifyCode("b@example.test", "123456");
    finish({ id: "A" } as User);
    await initialization;
    expect(useAuthStore.getState().user).toEqual(userB);
    expect(api.setToken).toHaveBeenLastCalledWith("new-token");
  });

  it("exits the loading screen when secure storage cannot be read", async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("locked"));
    useAuthStore.setState({ isLoading: true });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
