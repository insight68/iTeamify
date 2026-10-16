import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api";
import { projectKeys } from "./queries";
import type { ProjectWorkflowAction } from "./workflow-schemas";

export * from "./workflow-schemas";

export const projectWorkflowKeys = {
  all: (wsId: string) => ["project-workflows", wsId] as const,
  list: (wsId: string) => [...projectWorkflowKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) =>
    [...projectWorkflowKeys.all(wsId), id] as const,
};

export function projectWorkflowsOptions(wsId: string) {
  return queryOptions({
    queryKey: projectWorkflowKeys.list(wsId),
    queryFn: ({ signal }) =>
      api
        .withRequestContext({ workspaceId: wsId, signal })
        .listProjectWorkflows(),
    refetchInterval: 10000,
  });
}

export function projectWorkflowOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: projectWorkflowKeys.detail(wsId, id),
    queryFn: ({ signal }) =>
      api
        .withRequestContext({ workspaceId: wsId, signal })
        .getProjectWorkflow(id),
    refetchInterval: 5000,
  });
}

export function useProjectWorkflowAction(wsId: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectWorkflowAction) =>
      api
        .withRequestContext({ workspaceId: wsId })
        .projectWorkflowAction(id, input),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: projectWorkflowKeys.all(wsId) }),
        qc.invalidateQueries({ queryKey: projectKeys.all(wsId) }),
      ]),
  });
}
