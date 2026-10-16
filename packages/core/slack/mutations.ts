import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { RegisterSlackBYORequest } from "../types";
import { slackKeys } from "./queries";

export function useRegisterSlackBYO(workspaceId: string, agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RegisterSlackBYORequest) =>
      api.registerSlackBYO(workspaceId, agentId, request),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: slackKeys.installations(workspaceId),
      }),
  });
}

export function useDeleteSlackInstallation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) =>
      api.deleteSlackInstallation(workspaceId, installationId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: slackKeys.installations(workspaceId),
      }),
  });
}
