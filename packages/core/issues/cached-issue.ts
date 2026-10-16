import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Issue } from "../types";

// Index immutable Query snapshots lazily. Weak keys release the derived index
// with its source data; Query remains the sole owner of server state.
const snapshotIndexes = new WeakMap<object, Map<string, Issue>>();

function collectIssues(data: unknown, index: Map<string, Issue>): void {
  if (!data || typeof data !== "object") return;
  if (Array.isArray(data)) {
    for (const item of data) collectIssues(item, index);
    return;
  }
  const value = data as Record<string, unknown>;
  if (typeof value.id === "string" && typeof value.title === "string" && typeof value.workspace_id === "string") {
    const issue = data as Issue;
    index.set(`${issue.workspace_id}:${issue.id}`, issue);
    if (typeof issue.identifier === "string") index.set(`${issue.workspace_id}:${issue.identifier}`, issue);
    return;
  }
  // Existing Query projections: buckets, flat pages, grouped windows, table rows.
  for (const key of ["issues", "pages", "groups", "rows", "issue"]) {
    collectIssues(value[key], index);
  }
  if (value.byStatus && typeof value.byStatus === "object") {
    collectIssues(Object.values(value.byStatus), index);
  }
}

function findInData(data: unknown, wsId: string, id: string): Issue | undefined {
  if (!data || typeof data !== "object") return undefined;
  let index = snapshotIndexes.get(data);
  if (!index) {
    index = new Map();
    collectIssues(data, index);
    snapshotIndexes.set(data, index);
  }
  return index.get(`${wsId}:${id}`);
}

/** Read existing server-state projections without mounting or fetching a list. */
export function findCachedIssue(qc: QueryClient, wsId: string, id: string): Issue | undefined {
  if (!wsId || !id) return undefined;
  const detail = qc.getQueryData<Issue>(["issues", wsId, "detail", id]);
  if (detail?.workspace_id === wsId) return detail;
  let found: Issue | undefined;
  let updatedAt = -1;
  for (const query of qc.getQueryCache().findAll({ queryKey: ["issues", wsId] })) {
    const issue = findInData(query.state.data, wsId, id);
    if (issue?.workspace_id === wsId && query.state.dataUpdatedAt >= updatedAt) {
      found = issue;
      updatedAt = query.state.dataUpdatedAt;
    }
  }
  return found;
}

/** Return the original entity reference so unrelated cache updates do not render a chip. */
export function useCachedIssue(wsId: string, id: string): Issue | undefined {
  const qc = useQueryClient();
  const subscribe = useCallback((notify: () => void) => qc.getQueryCache().subscribe((event) => {
    const key = event.query.queryKey;
    if (key[0] === "issues" && key[1] === wsId &&
      (event.type === "removed" || (event.type === "updated" && event.action.type !== "fetch"))) notify();
  }), [qc, wsId]);
  const snapshot = useCallback(() => findCachedIssue(qc, wsId, id), [qc, wsId, id]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
