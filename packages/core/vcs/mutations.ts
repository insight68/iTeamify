import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConnectVCSRequest } from "../types";
import { vcsKeys } from "./queries";

export function useConnectVCS(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ConnectVCSRequest) =>
      api.connectVCS(workspaceId, request),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: vcsKeys.connections(workspaceId),
      }),
  });
}

export function useRotateVCSWebhook(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api.rotateVCSWebhook(workspaceId, connectionId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: vcsKeys.connections(workspaceId),
      }),
  });
}

export function useDeleteVCSConnection(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api.deleteVCSConnection(workspaceId, connectionId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: vcsKeys.connections(workspaceId),
      }),
  });
}
