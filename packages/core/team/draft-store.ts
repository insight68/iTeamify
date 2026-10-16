import { createDraftStore } from "../drafts";

export interface PendingDirectMessage {
  client_message_id: string;
  content: string;
  status: "sending" | "failed";
}

interface DirectDrafts {
  texts: Record<string, string>;
  pending: Record<string, PendingDirectMessage[]>;
}

export const useDirectDraftStore = createDraftStore<DirectDrafts>({
  storageKey: "iteamify:direct:drafts",
  emptyData: { texts: {}, pending: {} },
  hasMeaningful: (d) => Object.values(d.texts).some(Boolean) || Object.values(d.pending).some((p) => p.length > 0),
  migrateData: (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const data = raw as Partial<DirectDrafts>;
    const texts = Object.fromEntries(Object.entries(data.texts ?? {}).filter((entry) => typeof entry[1] === "string"));
    const pending = Object.fromEntries(Object.entries(data.pending ?? {}).map(([key, messages]) => [key, Array.isArray(messages) ? messages.filter((m) => typeof m?.client_message_id === "string" && typeof m?.content === "string").map((m) => ({ ...m, status: "failed" as const })) : []]));
    return { texts, pending };
  },
});

export function directDraftKey(wsId: string, userId: string, otherId: string, sessionId?: string) { return `${wsId}:${userId}:${otherId}${sessionId ? `:${sessionId}` : ""}`; }

export function setDirectDraft(key: string, text: string) {
  const store = useDirectDraftStore.getState();
  store.setDraft({ texts: { ...store.draft.texts, [key]: text } });
}

export function setPendingDirectMessage(key: string, message: PendingDirectMessage) {
  const store = useDirectDraftStore.getState();
  const messages = store.draft.pending[key] ?? [];
  store.setDraft({ pending: { ...store.draft.pending, [key]: [...messages.filter((m) => m.client_message_id !== message.client_message_id), message] } });
}

export function removePendingDirectMessage(key: string, clientId: string) {
  const store = useDirectDraftStore.getState();
  store.setDraft({ pending: { ...store.draft.pending, [key]: (store.draft.pending[key] ?? []).filter((m) => m.client_message_id !== clientId) } });
}
