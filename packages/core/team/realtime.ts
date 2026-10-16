import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { directMessageSchema, directSessionSchema } from "./schemas";
import { applyDirectRead, insertDirectMessage, upsertDirectSession } from "./mutations";
import { teamKeys } from "./queries";
import type { DirectMessagesPage } from "./types";
const eventSchema = z.object({ workspace_id: z.string().uuid(), other_user_id: z.string().uuid(), message: directMessageSchema.optional(), session: directSessionSchema.optional(), chat_session_id: z.string().uuid().optional(), read_sequence: z.number().int().nonnegative().optional() });
export function applyDirectEvent(qc: QueryClient, wsId: string, userId: string, payload: unknown) {
    const result = eventSchema.safeParse(payload);
    if (!result.success)
        return;
    const data = result.data;
    if (data.workspace_id !== wsId) {
        qc.invalidateQueries({ queryKey: teamKeys.all(data.workspace_id), refetchType: "none" });
        return;
    }
    const sessionId = data.message?.chat_session_id ?? data.chat_session_id;
    if (!sessionId)
        return;
    const key = teamKeys.messages(wsId, userId, sessionId);
    const old = qc.getQueryData<InfiniteData<DirectMessagesPage>>(key);
    if (data.message) {
        // A composing pane has a disabled query with no data yet. Its first
        // private acknowledgement must survive even if the POST response is lost.
        if (!old && data.message.sequence === 1 && qc.getQueryState(key))
            qc.setQueryData(key, { pages: [{ messages: [], has_more: false, next_cursor: null, read_sequence: data.message.sender_id === userId ? 1 : 0, can_send: true }], pageParams: [null] });
        const latest = Math.max(0, ...(old?.pages[0]?.messages.map((m) => m.sequence) ?? []));
        insertDirectMessage(qc, wsId, userId, sessionId, data.message);
        if (old && data.message.sequence > latest + 1)
            qc.invalidateQueries({ queryKey: key });
    }
    if (data.session)
        upsertDirectSession(qc, wsId, userId, data.session);
    if (data.read_sequence !== undefined) {
        applyDirectRead(qc, wsId, userId, sessionId, data.read_sequence);
    }
    qc.invalidateQueries({ queryKey: teamKeys.activity(wsId, userId) });
}
