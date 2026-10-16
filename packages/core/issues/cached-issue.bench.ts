import { bench, describe } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Issue } from "../types";
import { findCachedIssue } from "./cached-issue";
import { issueKeys } from "./queries";

for (const count of [1_000, 10_000, 50_000]) {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const issues = Array.from({ length: count }, (_, i) => ({ id: `issue-${i}`, workspace_id: "ws", identifier: `A-${i}`, title: `Issue ${i}` } as Issue));
  const rows = issues.map((issue) => ({ issue }));
  const tableKey = ["issues", "ws", "table-query", "rows"];
  qc.setQueryData(tableKey, { rows });
  describe(`cached reference / ${count} rows`, () => {
    // Tinybench warms up this path: it measures repeated snapshot lookups.
    bench("table-window lookup", () => { findCachedIssue(qc, "ws", `issue-${count - 1}`); });
    const coldQC = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, structuralSharing: false } } });
    // Include Query snapshot replacement plus its first O(n) index build.
    bench("new snapshot and index", () => {
      coldQC.setQueryData(tableKey, { rows });
      findCachedIssue(coldQC, "ws", `issue-${count - 1}`);
    });
    const detailQC = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    detailQC.setQueryData(issueKeys.detail("ws", "target"), { ...issues[0], id: "target" });
    bench("canonical detail lookup", () => { findCachedIssue(detailQC, "ws", "target"); });
  });
}
