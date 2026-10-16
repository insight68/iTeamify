import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api";
import { redditKeys } from "./queries";
import type { RedditDraftInput } from "./schemas";
export const redditConnectionsOptions = (wsId: string) =>
  queryOptions({
    queryKey: [...redditKeys.all(wsId), "connections"],
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.redditConnections(wsId);
    },
    enabled: !!wsId,
    refetchInterval: 10_000,
  });
export const redditDraftsOptions = (wsId: string) =>
  queryOptions({
    queryKey: [...redditKeys.all(wsId), "drafts"],
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.redditDrafts(wsId);
    },
    enabled: !!wsId,
    refetchInterval: 5_000,
    gcTime: 0,
  });
export const redditReadOptions = (
  wsId: string,
  kind: "search" | "thread",
  params: Record<string, string>,
) =>
  queryOptions({
    queryKey: [...redditKeys.all(wsId), kind, params],
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.redditRead(wsId, kind, params);
    },
    enabled: !!wsId && !!params.connection_id,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
export function useRedditConnect(wsId: string) {
  return useMutation({
    mutationFn: ({
      id = "",
      reply = false,
    }: {
      id?: string;
      reply?: boolean;
    }) => api.redditConnect(wsId, id, reply),
  });
}
export function useRedditDisconnect(wsId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.redditDisconnect(wsId, id),
    onSuccess: () => {
      client.removeQueries({ queryKey: redditKeys.all(wsId) });
    },
  });
}
export function useRedditSaveDraft(wsId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, id }: { input: RedditDraftInput; id?: string }) =>
      api.redditSaveDraft(wsId, input, id),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: [...redditKeys.all(wsId), "drafts"],
      }),
  });
}
export function useRedditDraftAction(wsId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      version,
      fullname,
    }: {
      id: string;
      action: "approve" | "cancel" | "verify";
      version: number;
      fullname?: string;
    }) => api.redditDraftAction(wsId, id, action, version, fullname),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: [...redditKeys.all(wsId), "drafts"],
      }),
  });
}
