import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { gmailKeys } from "./queries";

export function useBeginGmailConnect() {
  return useMutation({
    mutationFn: (returnPath: string) => api.beginGmailConnect(returnPath),
  });
}

export function useUpdateGmailAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, enabled }: { connectionId: string; enabled: boolean }) =>
      api.updateGmailAnalysis(connectionId, enabled),
    onSettled: () => queryClient.invalidateQueries({ queryKey: gmailKeys.connectionLists() }),
  });
}

export function useDeleteGmailConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => api.deleteGmailConnection(connectionId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: gmailKeys.connectionLists() }),
  });
}
