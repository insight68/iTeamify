import { createDraftStore } from "../drafts";
interface SendIdentity {
    agentId: string;
    payload: string;
    sessionId: string;
    messageId: string;
}
const useChatSendIdentities = createDraftStore<{
    entries: Record<string, SendIdentity>;
}>({
    storageKey: "iteamify:chat:send-identities",
    emptyData: { entries: {} },
    hasMeaningful: (draft) => Object.keys(draft.entries).length > 0,
    migrateData: (raw) => {
        if (!raw || typeof raw !== "object" || !("entries" in raw) || !raw.entries || typeof raw.entries !== "object")
            return {};
        const entries = Object.fromEntries(Object.entries(raw.entries).filter(([, entry]) => entry && typeof entry.agentId === "string" && typeof entry.payload === "string" && typeof entry.sessionId === "string" && typeof entry.messageId === "string"));
        return { entries };
    },
});
/** Keep request identity with the recoverable draft across lost responses/reloads. */
export function chatSendIdentity(key: string, agentId: string, payload: string, sessionId?: string | null): SendIdentity {
    const store = useChatSendIdentities.getState();
    const previous = store.draft.entries[key];
    if (previous?.agentId === agentId && previous.payload === payload)
        return previous;
    const identity = { agentId, payload, sessionId: sessionId ?? (previous?.agentId === agentId ? previous.sessionId : crypto.randomUUID()), messageId: crypto.randomUUID() };
    store.setDraft({ entries: { ...store.draft.entries, [key]: identity } });
    return identity;
}
export function clearChatSendIdentity(key: string) {
    const store = useChatSendIdentities.getState();
    const entries = { ...store.draft.entries };
    delete entries[key];
    store.setDraft({ entries });
}
