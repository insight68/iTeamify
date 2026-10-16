import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { teamKeys } from "./queries";
import type { DirectMessage, DirectMessagesPage, DirectSession, SessionsPage } from "./types";
import { directDraftKey, removePendingDirectMessage, setDirectDraft, setPendingDirectMessage, useDirectDraftStore } from "./draft-store";
export function insertDirectMessage(qc: QueryClient, wsId: string, userId: string, sessionId: string, message: DirectMessage) {
    qc.setQueryData<InfiniteData<DirectMessagesPage>>(teamKeys.messages(wsId, userId, sessionId), (old) => {
        if (!old || old.pages.some((p) => p.messages.some((m) => m.id === message.id)))
            return old;
        return {
            ...old,
            pages: old.pages.map((page, i) => i === 0 ? {
                ...page,
                messages: [...page.messages, message].sort((a, b) => a.sequence - b.sequence),
            } : page),
        };
    });
}
function sessionActivity(session: DirectSession) {
  const messageAt = session.last_message_at ?? session.created_at;
  return session.last_activity_at && Date.parse(session.last_activity_at) > Date.parse(messageAt) ? session.last_activity_at : messageAt;
}
export function upsertDirectSession(qc: QueryClient, wsId: string, userId: string, session: DirectSession) {
    const listKey = teamKeys.sessions(wsId, userId, session.peer_user_id);
    const current = qc.getQueryData<DirectSession>(teamKeys.session(wsId, userId, session.id))
        ?? qc.getQueryData<InfiniteData<SessionsPage<DirectSession>>>(listKey)?.pages.flatMap((page) => page.sessions).find((row) => row.id === session.id);
    // POST receipts and private events can race across tabs or network retries.
    if (current && current.last_sequence > session.last_sequence) session = current;
    else if (current && current.last_sequence === session.last_sequence && !current.has_unread)
        session = { ...session, has_unread: session.container_has_unread === true };
    qc.setQueryData(teamKeys.session(wsId, userId, session.id), session);
    qc.setQueryData<InfiniteData<SessionsPage<DirectSession>>>(listKey, (old) => {
        if (!old)
            return old;
        const rows = [session, ...old.pages.flatMap((p) => p.sessions).filter((s) => s.id !== session.id)]
            .sort((a, b) => Date.parse(sessionActivity(b)) - Date.parse(sessionActivity(a)) || b.id.localeCompare(a.id));
        let offset = 0;
        return { ...old, pages: old.pages.map((page, index) => {
                const length = page.sessions.length + (index === 0 && !old.pages.some((p) => p.sessions.some((s) => s.id === session.id)) ? 1 : 0);
                const sessions = rows.slice(offset, offset + length);
                offset += length;
                const last = sessions.at(-1);
                return { ...page, sessions, next_cursor: page.next_cursor && last ? `${sessionActivity(last)}|${last.id}` : page.next_cursor };
            }) };
    });
}
export function applyDirectRead(qc: QueryClient, wsId: string, userId: string, sessionId: string, sequence: number) {
    qc.setQueryData<InfiniteData<DirectMessagesPage>>(teamKeys.messages(wsId, userId, sessionId), (old) => old && ({
        ...old, pages: old.pages.map((page) => ({ ...page, read_sequence: Math.max(page.read_sequence, sequence) })),
    }));
    const read = (session: DirectSession) => session.id === sessionId && sequence >= session.last_sequence
        ? { ...session, has_unread: session.container_has_unread === true } : session;
    qc.setQueryData<DirectSession>(teamKeys.session(wsId, userId, sessionId), (old) => old && read(old));
    qc.setQueriesData<InfiniteData<SessionsPage<DirectSession>>>({ queryKey: [...teamKeys.all(wsId), "sessions", userId] },
        (old) => old && ({ ...old, pages: old.pages.map((page) => ({ ...page, sessions: page.sessions.map(read) })) }));
}
export function useSendDirectMessage(wsId: string, userId: string, otherId: string, sessionId: string, creating = false) {
    const qc = useQueryClient();
    const key = directDraftKey(wsId, userId, otherId, sessionId);
    return useMutation({
        mutationFn: (data: {
            content: string;
            client_message_id: string;
        }) => api.sendDirectMessage(wsId, sessionId, { ...data, ...(creating ? { peer_user_id: otherId } : {}) }),
        onMutate: (data) => {
            setPendingDirectMessage(key, { ...data, status: "sending" });
            if (useDirectDraftStore.getState().draft.texts[key] === data.content)
                setDirectDraft(key, "");
        },
        onSuccess: ({ message, session }) => {
            upsertDirectSession(qc, wsId, userId, session);
            if (creating && !qc.getQueryData(teamKeys.messages(wsId, userId, sessionId))) {
                qc.setQueryData(teamKeys.messages(wsId, userId, sessionId), { pages: [{ messages: [message], has_more: false, next_cursor: null, read_sequence: message.sequence, can_send: true }], pageParams: [null] });
            }
            else
                insertDirectMessage(qc, wsId, userId, sessionId, message);
            removePendingDirectMessage(key, message.client_message_id);
        },
        onError: (_error, data) => setPendingDirectMessage(key, { ...data, status: "failed" }),
        onSettled: () => {
            if (creating)
                qc.invalidateQueries({ queryKey: teamKeys.messages(wsId, userId, sessionId), refetchType: "none" });
            qc.invalidateQueries({ queryKey: teamKeys.activity(wsId, userId) });
        },
    });
}
export function useMarkDirectMessagesRead(wsId: string, userId: string, sessionId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (sequence: number) => api.markDirectMessagesRead(wsId, sessionId, sequence),
        retry: 1,
        onSuccess: (_data, sequence) => {
            applyDirectRead(qc, wsId, userId, sessionId, sequence);
            qc.invalidateQueries({ queryKey: teamKeys.activity(wsId, userId) });
        },
    });
}
