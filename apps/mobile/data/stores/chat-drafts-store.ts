/**
 * Per-session chat drafts. In-memory only — drafts survive tab switches and
 * navigation, but are lost on app cold start. v1 doesn't persist (an
 * SecureStore-backed write on every keystroke would be wasteful; if user
 * feedback shows people lose work to backgrounding kills, persist via the
 * usual debounced flush pattern in v2).
 *
 * Key conventions:
 *   - Workspace id plus session id for existing sessions
 *   - Workspace id plus __new__ for a not-yet-created chat
 */
import type { ChatDraftRestore } from "@iteamify/core/types";
import { create } from "zustand";

export function chatDraftKey(wsId: string | null, sessionId: string | null) {
  return `${wsId ?? ""}:${sessionId ?? "__new__"}`;
}

export interface RestoreDraftRequest extends ChatDraftRestore { serverRestoreId?: string; }

interface ChatDraftsState {
  restores: RestoreDraftRequest[];
  appliedRestoreIds: Record<string, true>;
  enqueueRestore: (restore: RestoreDraftRequest) => void;
  applyRestore: (id: string) => void;
  drafts: Record<string, string>;
  setDraft: (sessionId: string, text: string) => void;
  clearDraft: (sessionId: string) => void;
  /** Move the `__new__` draft onto a freshly-created session id without
   *  the user seeing an empty input on the first frame after send. */
  promoteNewDraft: (wsId: string, newSessionId: string) => void;
}

export const useChatDraftsStore = create<ChatDraftsState>((set, get) => ({
  restores: [],
  appliedRestoreIds: {},
  enqueueRestore: (restore) => set((state) => state.appliedRestoreIds[restore.id] || state.restores.some((item) => item.id === restore.id)
    ? state : { restores: [...state.restores, restore] }),
  applyRestore: (id) => set((state) => ({ restores: state.restores.filter((item) => item.id !== id), appliedRestoreIds: { ...state.appliedRestoreIds, [id]: true } })),
  drafts: {},
  setDraft: (sessionId, text) => {
    const current = get().drafts;
    // Skip the set when the value is identical — Zustand would still emit
    // a notification and trigger a re-render of every selector subscriber.
    if (current[sessionId] === text) return;
    if (text === "") {
      // Empty input == no draft; prune so we don't accumulate dead keys.
      if (!(sessionId in current)) return;
      const next = { ...current };
      delete next[sessionId];
      set({ drafts: next });
      return;
    }
    set({ drafts: { ...current, [sessionId]: text } });
  },
  clearDraft: (sessionId) => {
    const current = get().drafts;
    if (!(sessionId in current)) return;
    const next = { ...current };
    delete next[sessionId];
    set({ drafts: next });
  },
  promoteNewDraft: (wsId, newSessionId) => {
    const current = get().drafts;
    const pending = current[chatDraftKey(wsId, null)];
    if (!pending) return;
    const next = { ...current, [chatDraftKey(wsId, newSessionId)]: pending };
    delete next[chatDraftKey(wsId, null)];
    set({ drafts: next });
  },
}));
