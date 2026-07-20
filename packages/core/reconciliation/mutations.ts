import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { reconciliationKeys } from "./queries";

export function useConfirmReconciliation(wsId: string, agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (batchNos: string[]) =>
      api.confirmReconciliation(agentId, batchNos),

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: reconciliationKeys.all(wsId),
      });
    },
  });
}

export function useUnlockReconciliation(wsId: string, agentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { batchNo: string; unlockReason?: string }) =>
      api.unlockReconciliation(agentId, params.batchNo, params.unlockReason),

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: reconciliationKeys.all(wsId),
      });
    },
  });
}

export function useExportReconciliation() {
  return useMutation({
    mutationFn: (params: {
      agentId?: string;
      wsId?: string;
      filters?: Record<string, unknown>;
    }) => {
      if (params.wsId) {
        return api.exportWorkspaceReconciliation(params.wsId, params.filters);
      }
      if (params.agentId) {
        return api.exportReconciliation(params.agentId, params.filters);
      }
      throw new Error("useExportReconciliation requires wsId or agentId");
    },
  });
}

// ── Workspace-scoped mutations (standalone route) ──

export function useConfirmWorkspaceReconciliation(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (batchNos: string[]) =>
      api.confirmWorkspaceReconciliation(wsId, batchNos),

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: reconciliationKeys.all(wsId),
      });
    },
  });
}

export function useUnlockWorkspaceReconciliation(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { batchNo: string; unlockReason?: string }) =>
      api.unlockWorkspaceReconciliation(wsId, params.batchNo, params.unlockReason),

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: reconciliationKeys.all(wsId),
      });
    },
  });
}
