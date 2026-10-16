/**
 * Mobile auth store — Zustand. Logic mirrors packages/core/auth/store.ts:
 *   - Token written ONLY on successful verifyCode
 *   - 401 → clear token; non-401 (5xx / network blip) → preserve token so
 *     the next launch can retry
 *   - logout = clear token + clear in-memory user + setToken(null)
 *
 * NOT shared with web/desktop (per Sharing Principles in root CLAUDE.md).
 * Storage backend is expo-secure-store (mobile only); web uses HttpOnly
 * cookies, desktop uses localStorage via StorageAdapter.
 */
import { create } from "zustand";
import type { User } from "@iteamify/core/types";
import { api, ApiError } from "./api";
import { clearToken, getToken, setToken } from "./secure-storage";
import { useWorkspaceStore } from "./workspace-store";
import { resetSessionState } from "./reset-session-state";

let authOperation = 0;

interface AuthState {
  user: User | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Overwrite the in-memory user — call after PATCH /api/me so name/avatar
   *  edits land without a refetch. Server response is the source of truth. */
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  initialize: async () => {
    const operation = ++authOperation;
    // Restore the persisted workspace slug alongside the auth token so the
    // entry redirect (app/index.tsx) can route directly to the last-used
    // workspace without flashing /select-workspace.
    try {
      await useWorkspaceStore.getState().restoreSlug();

      const token = await getToken();
      if (operation !== authOperation) return;
      if (!token) {
        set({ isLoading: false });
        return;
      }
      api.setToken(token);
      const user = await api.getMe();
      if (operation !== authOperation) return;
      set({ user, isLoading: false });
    } catch (err) {
      if (operation !== authOperation) return;
      // Only clear token on a genuine 401. Network blips / 5xx keep the
      // token so the next launch (or a manual refresh) can retry.
      if (err instanceof ApiError && err.status === 401) {
        await useAuthStore.getState().logout();
        return;
      }
      set({ user: null, isLoading: false });
    }
  },

  sendCode: async (email) => {
    await api.sendCode(email);
  },

  verifyCode: async (email, code) => {
    const operation = ++authOperation;
    const { token, user } = await api.verifyCode(email, code);
    if (operation !== authOperation) throw new Error("Sign-in was cancelled");
    await setToken(token);
    if (operation !== authOperation) throw new Error("Sign-in was cancelled");
    resetSessionState();
    api.setToken(token);
    set({ user, isLoading: false });
    return user;
  },

  logout: async () => {
    ++authOperation;
    api.setToken(null);
    set({ user: null, isLoading: false });
    resetSessionState();
    const results = await Promise.allSettled([
      clearToken(), useWorkspaceStore.getState().clear(),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      console.warn("[auth] signed out; secure storage cleanup failed");
    }
  },

  setUser: (user) => set({ user }),
}));
