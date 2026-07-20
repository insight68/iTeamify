import { create } from "zustand";
import type { StorageAdapter } from "../types";
import { getCurrentSlug, registerForWorkspaceRehydration } from "../platform/workspace-storage";
import { createLogger } from "../logger";

const logger = createLogger("chat.store");

const AGENT_STORAGE_KEY = "teamify:chat:selectedAgentId";
const SESSION_STORAGE_KEY = "teamify:chat:activeSessionId";
/** Drafts are stored as one JSON blob per workspace: { [sessionId]: text }. */
const DRAFTS_KEY = "teamify:chat:drafts";
/** Table column sizing is stored per workspace: { [tableKey]: { [columnId]: px } }. */
const TABLE_COLUMN_SIZING_KEY = "teamify:chat:tableColumnSizing";
/** Placeholder sessionId for a chat that hasn't been created yet. */
export const DRAFT_NEW_SESSION = "__new__";
/** Focus mode is a personal preference — global across workspaces/sessions. */
const FOCUS_MODE_KEY = "teamify:chat:focusMode";

export type AgentTableColumnSizing = Record<string, number>;

function readDrafts(storage: StorageAdapter, key: string): Record<string, string> {
  const raw = storage.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeDrafts(storage: StorageAdapter, key: string, drafts: Record<string, string>) {
  // Prune empty entries so the blob doesn't grow unbounded.
  const pruned: Record<string, string> = {};
  for (const [k, v] of Object.entries(drafts)) {
    if (v) pruned[k] = v;
  }
  if (Object.keys(pruned).length === 0) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(pruned));
  }
}

function sanitizeColumnSizing(value: unknown): AgentTableColumnSizing {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const sizing: AgentTableColumnSizing = {};
  for (const [columnId, width] of Object.entries(value)) {
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
      continue;
    }
    sizing[columnId] = Math.round(width);
  }
  return sizing;
}

function readTableColumnSizing(
  storage: StorageAdapter,
  key: string,
): Record<string, AgentTableColumnSizing> {
  const raw = storage.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, AgentTableColumnSizing> = {};
    for (const [tableKey, value] of Object.entries(parsed)) {
      const sizing = sanitizeColumnSizing(value);
      if (Object.keys(sizing).length > 0) {
        result[tableKey] = sizing;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeTableColumnSizing(
  storage: StorageAdapter,
  key: string,
  tableColumnSizing: Record<string, AgentTableColumnSizing>,
) {
  const pruned: Record<string, AgentTableColumnSizing> = {};
  for (const [tableKey, value] of Object.entries(tableColumnSizing)) {
    const sizing = sanitizeColumnSizing(value);
    if (Object.keys(sizing).length > 0) {
      pruned[tableKey] = sizing;
    }
  }
  if (Object.keys(pruned).length === 0) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(pruned));
  }
}

/**
 * Kept as a public type because existing consumers (chat-message-list,
 * views/chat types) import it. Items themselves no longer live in the
 * store — they flow through the React Query cache keyed by task id.
 */
export interface ChatTimelineItem {
  seq: number;
  type: "tool_use" | "tool_result" | "thinking" | "text" | "error";
  tool?: string;
  content?: string;
  input?: Record<string, unknown>;
  output?: string;
}

/**
 * A derived "where I am" pointer — not stored, recomputed each render from
 * the current route + react-query cache. The type is exported because
 * consumers (buildAnchorMarkdown, chip props) share the same shape.
 */
export interface ContextAnchor {
  type: "issue" | "project";
  /** UUID for `issue`, UUID for `project`. */
  id: string;
  /** Human-readable label: issue identifier (MUL-1) or project title. */
  label: string;
  /** Optional secondary text — issue title for issue anchors. */
  subtitle?: string;
}

export interface ChatState {
  activeSessionId: string | null;
  selectedAgentId: string | null;
  /** Drafts per session: sessionId (or DRAFT_NEW_SESSION) → markdown text. */
  inputDrafts: Record<string, string>;
  /**
   * When on, the chat tracks whatever issue/project/inbox-item the user is
   * looking at and prepends it to outgoing messages. Persisted globally so
   * the preference survives workspace switches and reloads.
   */
  focusMode: boolean;
  /** Persisted per-agent table column widths, keyed by table identity. */
  tableColumnSizing: Record<string, AgentTableColumnSizing>;
  /**
   * Scroll position per session (scrollTop value). Not persisted — only
   * survives within the current session in memory so switching between
   * sessions and back restores the reading position.
   */
  scrollPositions: Record<string, number>;
  setActiveSession: (id: string | null) => void;
  setSelectedAgentId: (id: string) => void;
  /** sessionId accepts a real session UUID or DRAFT_NEW_SESSION. */
  setInputDraft: (sessionId: string, draft: string) => void;
  clearInputDraft: (sessionId: string) => void;
  setFocusMode: (on: boolean) => void;
  setTableColumnSizing: (
    tableKey: string,
    sizing: AgentTableColumnSizing,
  ) => void;
  setScrollPosition: (sessionId: string, scrollTop: number) => void;
}

export interface ChatStoreOptions {
  storage: StorageAdapter;
}

export function createChatStore(options: ChatStoreOptions) {
  const { storage } = options;

  const wsKey = (base: string) => {
    const slug = getCurrentSlug();
    return slug ? `${base}:${slug}` : base;
  };

  const store = create<ChatState>((set, get) => ({
    activeSessionId: storage.getItem(wsKey(SESSION_STORAGE_KEY)),
    selectedAgentId: storage.getItem(wsKey(AGENT_STORAGE_KEY)),
    inputDrafts: readDrafts(storage, wsKey(DRAFTS_KEY)),
    focusMode: storage.getItem(FOCUS_MODE_KEY) === "true",
    tableColumnSizing: readTableColumnSizing(
      storage,
      wsKey(TABLE_COLUMN_SIZING_KEY),
    ),
    scrollPositions: {},
    setActiveSession: (id) => {
      logger.info("setActiveSession", { from: get().activeSessionId, to: id });
      if (id) {
        storage.setItem(wsKey(SESSION_STORAGE_KEY), id);
      } else {
        storage.removeItem(wsKey(SESSION_STORAGE_KEY));
      }
      set({ activeSessionId: id });
    },
    setSelectedAgentId: (id) => {
      logger.info("setSelectedAgentId", { from: get().selectedAgentId, to: id });
      storage.setItem(wsKey(AGENT_STORAGE_KEY), id);
      set({ selectedAgentId: id });
    },
    setInputDraft: (sessionId, draft) => {
      logger.debug("setInputDraft", { sessionId, length: draft.length });
      const next = { ...get().inputDrafts, [sessionId]: draft };
      writeDrafts(storage, wsKey(DRAFTS_KEY), next);
      set({ inputDrafts: next });
    },
    setFocusMode: (on) => {
      logger.info("setFocusMode", { to: on });
      if (on) storage.setItem(FOCUS_MODE_KEY, "true");
      else storage.removeItem(FOCUS_MODE_KEY);
      set({ focusMode: on });
    },
    setTableColumnSizing: (tableKey, sizing) => {
      const sanitized = sanitizeColumnSizing(sizing);
      const next = { ...get().tableColumnSizing };
      if (Object.keys(sanitized).length > 0) {
        next[tableKey] = sanitized;
      } else {
        delete next[tableKey];
      }
      writeTableColumnSizing(storage, wsKey(TABLE_COLUMN_SIZING_KEY), next);
      set({ tableColumnSizing: next });
    },
    setScrollPosition: (sessionId, scrollTop) => {
      set((state) => ({
        scrollPositions: { ...state.scrollPositions, [sessionId]: scrollTop },
      }));
    },
    clearInputDraft: (sessionId) => {
      const current = get().inputDrafts;
      if (!(sessionId in current)) {
        logger.debug("clearInputDraft skipped (no draft)", { sessionId });
        return;
      }
      logger.info("clearInputDraft", { sessionId });
      const next = { ...current };
      delete next[sessionId];
      writeDrafts(storage, wsKey(DRAFTS_KEY), next);
      set({ inputDrafts: next });
    },
  }));

  registerForWorkspaceRehydration(() => {
    const nextSession = storage.getItem(wsKey(SESSION_STORAGE_KEY));
    const nextAgent = storage.getItem(wsKey(AGENT_STORAGE_KEY));
    const nextDrafts = readDrafts(storage, wsKey(DRAFTS_KEY));
    const nextTableColumnSizing = readTableColumnSizing(
      storage,
      wsKey(TABLE_COLUMN_SIZING_KEY),
    );
    logger.info("workspace rehydration", {
      prevSession: store.getState().activeSessionId,
      nextSession,
      prevAgent: store.getState().selectedAgentId,
      nextAgent,
      draftCount: Object.keys(nextDrafts).length,
    });
    store.setState({
      activeSessionId: nextSession,
      selectedAgentId: nextAgent,
      inputDrafts: nextDrafts,
      tableColumnSizing: nextTableColumnSizing,
    });
  });

  return store;
}
