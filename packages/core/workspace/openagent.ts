import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { WorkspaceOpenAgentConnectionTestSchema } from "../api/schemas";
import type { WorkspaceOpenAgentConfigInput } from "../types/openagent";
import { runtimeKeys } from "../runtimes/queries";

export const workspaceOpenAgentKey = (wsId: string) =>
  ["workspaces", wsId, "openagent"] as const;

export function workspaceOpenAgentOptions(wsId: string) {
  return queryOptions({
    queryKey: workspaceOpenAgentKey(wsId),
    enabled: !!wsId,
    queryFn: ({ signal }) => api
      .withRequestContext({ workspaceId: wsId, signal })
      .getWorkspaceOpenAgentConfig(wsId),
  });
}

export function useUpdateWorkspaceOpenAgent(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceOpenAgentConfigInput) => api
      .withRequestContext({ workspaceId: wsId })
      .updateWorkspaceOpenAgentConfig(wsId, input),
    onSuccess: (config) => {
      qc.setQueryData(workspaceOpenAgentKey(wsId), config);
      qc.invalidateQueries({ queryKey: runtimeKeys.all(wsId) });
    },
  });
}

export function workspaceOpenAgentTestErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const result = WorkspaceOpenAgentConnectionTestSchema.safeParse(error.body);
  return result.success && result.data.ok === false ? result.data.code : undefined;
}
