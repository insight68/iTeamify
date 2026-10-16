import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EmailDraft, OutboundEmail } from "./outbound-schemas";

export const outboundEmailKeys = {
  all: ["outbound-emails"] as const,
  workspace: (workspaceId: string) => ["outbound-emails", workspaceId] as const,
};

export const outboundEmailsOptions = (workspaceId: string, filters: { chat_session_id?: string }, live = false) =>
  queryOptions({
    queryKey: [...outboundEmailKeys.workspace(workspaceId), filters],
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listOutboundEmails(workspaceId, filters);
    },
    enabled: !!workspaceId && !!(filters.chat_session_id),
    staleTime: 5_000,
    refetchInterval: (query) => live || query.state.data?.some((email) => email.status === "queued" || email.status === "sending") ? 3_000 : false,
  });

export function useUpdateEmailDraft(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, draft }: { id: string; version: number; draft: EmailDraft }) => api.updateOutboundEmail(workspaceId, id, version, draft),
    onSuccess: (email) => client.setQueriesData<OutboundEmail[]>({ queryKey: outboundEmailKeys.workspace(workspaceId) }, (rows) => rows?.map((row) => row.id === email.id ? email : row)),
    onSettled: () => client.invalidateQueries({ queryKey: outboundEmailKeys.workspace(workspaceId) }),
  });
}

export function useSendEmail(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => api.sendOutboundEmail(workspaceId, id, version),
    onSuccess: (email) => client.setQueriesData<OutboundEmail[]>({ queryKey: outboundEmailKeys.workspace(workspaceId) }, (rows) => rows?.map((row) => row.id === email.id ? email : row)),
    // Never infer sent from an accepted HTTP request; refresh the durable row.
    onSettled: () => client.invalidateQueries({ queryKey: outboundEmailKeys.workspace(workspaceId) }),
  });
}
