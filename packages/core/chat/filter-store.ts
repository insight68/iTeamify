import { create } from "zustand";

/**
 * Agent-directed table filter state, keyed by chat session ID.
 *
 * When an agent calls the filter-table webhook, the server broadcasts a
 * `chat:table_filter` WS event, and `useRealtimeSync` writes the filters
 * here. Each chat session's table is fully independent — a filter change
 * in session "abc" never affects session "xyz".
 */
export interface AgentTableFilterState {
  /** Filters keyed by chat session ID. */
  sessionFilters: Record<string, Record<string, unknown>>;
  setSessionFilters: (
    sessionId: string,
    filters: Record<string, unknown>,
  ) => void;
  clearSessionFilters: (sessionId: string) => void;
}

export const useAgentTableFilterStore = create<AgentTableFilterState>(
  (set, get) => ({
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
  }),
);
