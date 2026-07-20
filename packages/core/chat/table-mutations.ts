import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { tableDataKeys } from "./table-queries";

interface TableSavePayload {
  agentId: string;
  action: "update" | "create" | "delete";
  row: Record<string, unknown>;
  rowKey?: string;
}

/**
 * Mutation for saving table cell edits (update / create / delete) back to the
 * external data source via the daemon's MCP tool execution.
 *
 * Uses optimistic updates: the edited row is applied to the cache immediately
 * so the table feels responsive regardless of daemon latency.
 */
export function useSaveTableData(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TableSavePayload) =>
      api.saveAgentTableData(payload.agentId, {
        action: payload.action,
        row: payload.row,
        rowKey: payload.rowKey,
      }),

    onMutate: async () => {
      // Cancel any in-flight table fetches so they don't overwrite our
      // optimistic update.
      await queryClient.cancelQueries({
        queryKey: tableDataKeys.all(wsId),
      });
    },

    onSettled: () => {
      // Invalidate all table-data queries for this workspace so the table
      // refetches fresh data.
      queryClient.invalidateQueries({
        queryKey: tableDataKeys.all(wsId),
      });
    },
  });
}
