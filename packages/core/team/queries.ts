import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api } from "../api";
export const teamKeys = {
    all: (wsId: string) => ["team", wsId] as const,
    activity: (wsId: string, userId: string) => [...teamKeys.all(wsId), "activity", userId] as const,
    sessions: (wsId: string, userId: string, otherId: string) => [...teamKeys.all(wsId), "sessions", userId, "direct", otherId, "active"] as const,
    session: (wsId: string, userId: string, sessionId: string) => [...teamKeys.all(wsId), "session", userId, sessionId] as const,
    messages: (wsId: string, userId: string, sessionId: string) => [...teamKeys.all(wsId), "messages", userId, sessionId] as const,
};
export function teamActivityOptions(wsId: string, userId: string) {
    return queryOptions({
        queryKey: teamKeys.activity(wsId, userId),
        queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listTeamActivity(wsId);
    },
        enabled: !!wsId && !!userId,
    });
}
export function directMessagesOptions(wsId: string, userId: string, sessionId: string) {
    return infiniteQueryOptions({
        queryKey: teamKeys.messages(wsId, userId, sessionId),
        queryFn: ({ pageParam, signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listDirectMessages(wsId, sessionId, pageParam);
    },
        initialPageParam: null as number | null,
        getNextPageParam: (page) => page.has_more ? page.next_cursor ?? undefined : undefined,
        enabled: !!wsId && !!sessionId,
    });
}
export function directSessionsOptions(wsId: string, userId: string, otherId: string) {
    return infiniteQueryOptions({
        queryKey: teamKeys.sessions(wsId, userId, otherId),
        queryFn: ({ pageParam, signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listDirectSessions(wsId, otherId, pageParam);
    },
        initialPageParam: null as string | null,
        getNextPageParam: (page) => page.next_cursor ?? undefined,
        enabled: !!wsId && !!userId && !!otherId,
    });
}
export function directSessionOptions(wsId: string, userId: string, sessionId: string) {
    return queryOptions({ queryKey: teamKeys.session(wsId, userId, sessionId), queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.getDirectSession(wsId, sessionId);
    }, enabled: !!wsId && !!sessionId });
}
