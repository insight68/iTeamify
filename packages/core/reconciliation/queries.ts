import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const reconciliationKeys = {
  all: (wsId: string) => ["reconciliation", wsId] as const,
  config: (wsId: string) => [...reconciliationKeys.all(wsId), "config"] as const,
  // Agent-scoped (kept for the optional agent override path)
  summary: (wsId: string, agentId: string, filters: Record<string, unknown>) =>
    [...reconciliationKeys.all(wsId), "summary", agentId, filters] as const,
  details: (wsId: string, agentId: string, batchNo: string, filters: Record<string, unknown>) =>
    [...reconciliationKeys.all(wsId), "details", agentId, batchNo, filters] as const,
  // Workspace-scoped (standalone /reconciliation route)
  workspaceSummary: (wsId: string, filters: Record<string, unknown>) =>
    [...reconciliationKeys.all(wsId), "ws-summary", filters] as const,
  workspaceDetails: (wsId: string, batchNo: string, filters: Record<string, unknown>) =>
    [...reconciliationKeys.all(wsId), "ws-details", batchNo, filters] as const,
};

export interface ReconciliationSummaryParams {
  filters?: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}

// ── Agent-scoped (optional override) ──

export function reconciliationSummaryOptions(
  wsId: string,
  agentId: string,
  params: ReconciliationSummaryParams = {},
) {
  const { filters = {}, page = 1, pageSize = 20 } = params;
  return queryOptions({
    queryKey: [...reconciliationKeys.summary(wsId, agentId, filters), page, pageSize],
    queryFn: () =>
      api.fetchReconciliationSummary(agentId, { filters, page, pageSize }),
    staleTime: 30_000,
    enabled: !!agentId,
  });
}

export interface ReconciliationDetailsParams {
  batchNo: string;
  filters?: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}

export function reconciliationDetailsOptions(
  wsId: string,
  agentId: string,
  params: ReconciliationDetailsParams,
) {
  const { batchNo, filters = {}, page = 1, pageSize = 50 } = params;
  return queryOptions({
    queryKey: [...reconciliationKeys.details(wsId, agentId, batchNo, filters), page, pageSize],
    queryFn: () =>
      api.fetchReconciliationDetails(agentId, { batchNo, filters, page, pageSize }),
    staleTime: 30_000,
    enabled: !!agentId && !!batchNo,
  });
}

// ── Workspace-scoped (standalone route) ──

export function workspaceReconciliationConfigOptions(wsId: string) {
  return queryOptions({
    queryKey: reconciliationKeys.config(wsId),
    queryFn: () => api.fetchWorkspaceReconciliationConfig(wsId),
    staleTime: 5 * 60_000,
    enabled: !!wsId,
  });
}

export function workspaceReconciliationSummaryOptions(
  wsId: string,
  params: ReconciliationSummaryParams = {},
) {
  const { filters = {}, page = 1, pageSize = 20 } = params;
  return queryOptions({
    queryKey: [...reconciliationKeys.workspaceSummary(wsId, filters), page, pageSize],
    queryFn: () =>
      api.fetchWorkspaceReconciliationSummary(wsId, { filters, page, pageSize }),
    staleTime: 30_000,
    enabled: !!wsId,
  });
}

export function workspaceReconciliationDetailsOptions(
  wsId: string,
  params: ReconciliationDetailsParams,
) {
  const { batchNo, filters = {}, page = 1, pageSize = 50 } = params;
  return queryOptions({
    queryKey: [...reconciliationKeys.workspaceDetails(wsId, batchNo, filters), page, pageSize],
    queryFn: () =>
      api.fetchWorkspaceReconciliationDetails(wsId, { batchNo, filters, page, pageSize }),
    staleTime: 30_000,
    enabled: !!wsId && !!batchNo,
  });
}
