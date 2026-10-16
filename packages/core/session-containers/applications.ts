import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { ApplicationWrite, SessionApplication } from "./application-schemas";
export * from "./application-schemas";

export const applicationKeys = { all: (wsId: string) => ["session-applications", wsId] as const };
export function applicationsOptions(wsId: string, userId: string, target?: { kind: "member" | "agent"; id: string }) {
  return queryOptions({ queryKey: [...applicationKeys.all(wsId), userId, target?.kind ?? "catalog", target?.id ?? ""], enabled: !!wsId && !!userId && (!target || !!target.id),
    queryFn: ({ signal }) => api.withRequestContext({ workspaceId: wsId, signal }).listSessionApplications(target),
  });
}
export function useSaveApplication(wsId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id?: string; input: ApplicationWrite }) => api.withRequestContext({ workspaceId: wsId }).saveSessionApplication(input, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: applicationKeys.all(wsId) }),
    onError: (error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) void qc.invalidateQueries({ queryKey: applicationKeys.all(wsId) }); },
  });
}
export function useDeleteApplication(wsId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (application: SessionApplication) => api.withRequestContext({ workspaceId: wsId }).deleteSessionApplication(application.id, application.version),
    onSuccess: () => qc.invalidateQueries({ queryKey: applicationKeys.all(wsId) }),
  });
}
