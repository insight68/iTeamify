import { create } from "zustand";

/**
 * Reconciliation-specific filter state.
 *
 * `sessionFilters` stores agent-directed filters received via the
 * `reconciliation:filter` WebSocket event, keyed by chat session ID.
 * The standalone page can also be launched without a session context —
 * in that case it uses the top-level `filters` state instead.
 */
export interface ReconciliationFilterState {
  /** User-selected filters (non-session context, e.g. standalone page). */
  filters: Record<string, unknown>;
  setFilters: (filters: Record<string, unknown>) => void;
  clearFilters: () => void;

  /** Agent-directed filters keyed by chat session ID. */
  sessionFilters: Record<string, Record<string, unknown>>;
  setSessionFilters: (sessionId: string, filters: Record<string, unknown>) => void;
  clearSessionFilters: (sessionId: string) => void;

  /** Currently selected batch_no for detail drill-down. */
  selectedBatchNo: string | null;
  setSelectedBatchNo: (batchNo: string | null) => void;
}

export const useReconciliationFilterStore = create<ReconciliationFilterState>(
  (set, get) => ({
    filters: {},
    setFilters: (filters) => set({ filters }),
    clearFilters: () => set({ filters: {} }),

    sessionFilters: {},
    setSessionFilters: (sessionId, filters) => {
      set({
        sessionFilters: {
          ...get().sessionFilters,
          [sessionId]: filters,
        },
      });
    },
    clearSessionFilters: (sessionId) => {
      const next = { ...get().sessionFilters };
      delete next[sessionId];
      set({ sessionFilters: next });
    },

    selectedBatchNo: null,
    setSelectedBatchNo: (batchNo) => set({ selectedBatchNo: batchNo }),
  }),
);
