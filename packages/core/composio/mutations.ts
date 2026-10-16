import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { composioKeys } from "./queries";

export function useBeginComposioConnect() {
  return useMutation({
    mutationFn: ({
      toolkitSlug,
      returnPath,
    }: {
      toolkitSlug: string;
      returnPath: string;
    }) => api.beginComposioConnect(toolkitSlug, returnPath),
  });
}

export function useDeleteComposioConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api.deleteComposioConnection(connectionId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: composioKeys.connections() }),
  });
}
