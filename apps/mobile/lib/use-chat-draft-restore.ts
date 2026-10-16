import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatDraftRestoresResponse } from "@iteamify/core/types";
import { api } from "@/data/api";
import { chatDraftRestoresOptions, chatKeys } from "@/data/queries/chat";
import { useChatDraftsStore } from "@/data/stores/chat-drafts-store";
import { removeChatMessage } from "@/data/realtime/chat-ws-updaters";

/** Mirrors Web's apply-before-consume flow; only the visible composer participates. */
export function useChatDraftRestore(sessionId: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const { data } = useQuery({ ...chatDraftRestoresOptions(sessionId), enabled: enabled && !!sessionId });
  const requests = useChatDraftsStore((state) => state.restores);
  const applied = useChatDraftsStore((state) => state.appliedRestoreIds);
  const inFlight = useRef(new Set<string>());
  const consume = useMutation({
    mutationFn: ({ session, id }: { session: string; id: string }) => api.consumeChatDraftRestore(session, id),
    onSuccess: (_data, { session, id }) => {
      qc.setQueryData<ChatDraftRestoresResponse>(chatKeys.draftRestores(session), (old) => old && ({ restores: old.restores.filter((restore) => restore.id !== id) }));
    },
    onSettled: (_data, _error, { id }) => { inFlight.current.delete(id); },
  });
  const mutate = consume.mutate;
  useEffect(() => {
    if (!enabled || !sessionId) return;
    for (const restore of data?.restores ?? []) {
      if (restore.chat_session_id !== sessionId) continue;
      if (applied[restore.id]) {
        if (!inFlight.current.has(restore.id)) {
          inFlight.current.add(restore.id);
          mutate({ session: sessionId, id: restore.id });
        }
      } else {
        removeChatMessage(qc, sessionId, restore.id);
        useChatDraftsStore.getState().enqueueRestore({ ...restore, serverRestoreId: restore.id });
      }
    }
  }, [data, applied, enabled, sessionId, mutate, qc]);
  const onApplied = useCallback((id: string) => {
    useChatDraftsStore.getState().applyRestore(id);
  }, []);
  return {
    restoreRequest: enabled ? requests.find((request) => request.chat_session_id === sessionId) : undefined,
    onApplied,
  };
}
