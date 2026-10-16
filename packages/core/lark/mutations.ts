import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { larkKeys } from "./queries";

export function useDeleteLarkInstallation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) =>
      api.deleteLarkInstallation(workspaceId, installationId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: larkKeys.installations(workspaceId),
      }),
  });
}
