// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { User, UpdateMeRequest } from "../types";
import { createAuthStore, registerAuthStore } from "../auth";
import { EMPTY_USER } from "../api/schemas";
import { currentUserKey, registerCurrentUserCache, publishCurrentUser } from "./cache";
import { useProfileForm } from "./use-profile-form";
import { useProfileDraftStore } from "./draft";
import { personalProfile, profilePatch, profileForAdvance } from "./model";
import { updateCurrentUser } from "./queries";
import { completeOnboarding } from "../onboarding/store";

const apiMock = vi.hoisted(() => ({ updateMe: vi.fn(), getMe: vi.fn(), markOnboardingComplete: vi.fn(), setToken: vi.fn(), advanceAuthSession: vi.fn() }));
vi.mock("../api", async (original) => ({ ...(await original<typeof import("../api")>()), api: { ...apiMock, withRequestContext: () => apiMock } }));
let qc: QueryClient;
let store: ReturnType<typeof createAuthStore>;
const initial: User = { ...EMPTY_USER, id: "owner-1", name: "Original", profile_description: "My preferences",
  onboarding_questionnaire: { role: "engineer", use_case: ["ship_code"], source: ["search"], version: 2 }, updated_at: "2026-10-14T01:00:00Z" };
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.resetAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  registerCurrentUserCache(qc);
  store = createAuthStore({ api: apiMock as never, storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() } });
  registerAuthStore(store);
  store.getState().setUser(structuredClone(initial));
  useProfileDraftStore.getState().clearDraft();
  apiMock.updateMe.mockImplementation(async (input: UpdateMeRequest) => {
    const saved = store.getState().user!;
    return { ...saved, ...input, onboarding_questionnaire: { ...saved.onboarding_questionnaire, ...input.questionnaire }, updated_at: "2026-10-14T01:01:00Z" };
  });
});

describe("shared personal profile", () => {
  it("patches only changed fields and never sends a stale source snapshot", () => {
    const saved = personalProfile(initial);
    expect(profilePatch({ ...saved, role: "designer" }, saved)).toEqual({ questionnaire: { role: "designer", role_other: null, role_skipped: false, version: 2 } });
    expect(profilePatch(saved, saved)).toEqual({});
    expect(profileForAdvance(saved, saved, true).role).toBe("engineer");
  });
  it("shares edits across both forms and acknowledges one save without another GET", async () => {
    const first = renderHook(() => useProfileForm(), { wrapper });
    const second = renderHook(() => useProfileForm(), { wrapper });
    act(() => first.result.current.change({ name: "Updated", role: "designer" }));
    expect(second.result.current.value?.name).toBe("Updated");
    await act(async () => { await second.result.current.save(); });
    expect(first.result.current.saved?.role).toBe("designer");
    expect(useProfileDraftStore.getState().draft.edits).toEqual({});
    expect(apiMock.updateMe).toHaveBeenCalledOnce();
    expect(apiMock.getMe).not.toHaveBeenCalled();
    expect(store.getState().user?.onboarding_questionnaire.source).toEqual(["search"]);
  });
  it("refreshes clean fields while preserving an edited field", async () => {
    const view = renderHook(() => useProfileForm(), { wrapper });
    act(() => view.result.current.change({ profile_description: "Unsaved introduction" }));
    act(() => { store.getState().setUser({ ...initial, name: "Changed elsewhere", onboarding_questionnaire: { role: "founder" }, updated_at: "2026-10-14T01:02:00Z" }); });
    await waitFor(() => expect(view.result.current.value?.name).toBe("Changed elsewhere"));
    expect(view.result.current.value?.role).toBe("founder");
    expect(view.result.current.value?.profile_description).toBe("Unsaved introduction");
  });
  it("keeps failed edits for retry", async () => {
    apiMock.updateMe.mockRejectedValueOnce(new Error("offline"));
    const view = renderHook(() => useProfileForm(), { wrapper });
    act(() => view.result.current.change({ name: "Retry me" }));
    await act(async () => { await expect(view.result.current.save()).rejects.toThrow("offline"); });
    expect(view.result.current.value?.name).toBe("Retry me");
    expect(view.result.current.saved?.name).toBe("Original");
  });
  it("settles server-normalized text and keeps newer edits made during saving", async () => {
    let resolve!: (user: User) => void;
    apiMock.updateMe.mockReturnValue(new Promise<User>((accept) => { resolve = accept; }));
    const view = renderHook(() => useProfileForm(), { wrapper });
    act(() => view.result.current.change({ name: "  Updated  ", profile_description: "First introduction" }));
    let saving!: Promise<User | undefined>;
    act(() => { saving = view.result.current.save(); });
    await waitFor(() => expect(apiMock.updateMe).toHaveBeenCalledOnce());
    act(() => view.result.current.change({ profile_description: "Newer introduction" }));
    await act(async () => { resolve({ ...initial, name: "Updated", profile_description: "First introduction" }); await saving; });
    expect(useProfileDraftStore.getState().draft.edits).toEqual({ profile_description: "Newer introduction" });
    expect(view.result.current.value?.name).toBe("Updated");
  });
  it("ignores another account's draft and rejects a late response after logout", async () => {
    useProfileDraftStore.getState().setDraft({ ownerId: "other", edits: { name: "Private" } });
    const view = renderHook(() => useProfileForm(), { wrapper });
    expect(view.result.current.value?.name).toBe("Original");
    let resolve!: (user: User) => void;
    apiMock.updateMe.mockReturnValue(new Promise<User>((accept) => { resolve = accept; }));
    const pending = updateCurrentUser({ name: "Late" });
    act(() => store.getState().logout());
    resolve({ ...initial, name: "Late" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(store.getState().user).toBeNull();
  });
  it("does not replace a newer receipt with an older full-user response", () => {
    const newest = { ...initial, name: "Newest", updated_at: "2026-10-14T02:00:00.000002Z" };
    publishCurrentUser(newest);
    expect(publishCurrentUser({ ...initial, updated_at: "2026-10-14T02:00:00.000001Z" }).name).toBe("Newest");
    expect(qc.getQueryData<User>(currentUserKey(initial.id))?.name).toBe("Newest");
  });
  it("uses the completion receipt rather than making a second identity request", async () => {
    apiMock.markOnboardingComplete.mockResolvedValue({ ...initial, onboarded_at: "2026-10-14T01:01:00Z", updated_at: "2026-10-14T01:01:00Z" });
    await completeOnboarding("full", "workspace-1");
    expect(store.getState().user?.onboarded_at).toBeTruthy();
    expect(apiMock.getMe).not.toHaveBeenCalled();
  });
});
