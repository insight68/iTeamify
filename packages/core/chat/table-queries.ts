import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const tableDataKeys = {
  all: (wsId: string) => ["table-data", wsId] as const,
  /** Table data for a specific agent, keyed by filters for auto-refetch. */
  agentTable: (wsId: string, agentId: string, filters: Record<string, unknown>) =>
    [...tableDataKeys.all(wsId), agentId, filters] as const,
};

export interface AgentTableDataParams {
  filters?: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}

export interface AgentTableRowsResponse {
  rows: Record<string, unknown>[];
  total: number;
}

const EXPORT_PAGE_SIZE = 1000;

export function agentTableDataOptions(
  wsId: string,
  agentId: string,
  params: AgentTableDataParams = {},
) {
  const { filters = {}, page = 1, pageSize = 20 } = params;
  return queryOptions({
    queryKey: [...tableDataKeys.agentTable(wsId, agentId, filters), page, pageSize] as const,
    queryFn: () =>
      api.fetchAgentTableData(agentId, { filters, page, pageSize }),
    staleTime: 30_000,
    enabled: !!agentId,
  });
}

export async function fetchAllAgentTableRows(
  agentId: string,
  params: Pick<AgentTableDataParams, "filters"> = {},
): Promise<AgentTableRowsResponse> {
  const filters = params.filters ?? {};
  const first = await api.fetchAgentTableData(agentId, {
    filters,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  });
  const rows = [...first.rows];
  const total = first.total ?? rows.length;

  let page = 2;
  while (rows.length < total) {
    const next = await api.fetchAgentTableData(agentId, {
      filters,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    });
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
    page += 1;
  }

  return { rows, total };
}
