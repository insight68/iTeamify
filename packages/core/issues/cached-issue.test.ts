import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { findCachedIssue } from "./cached-issue";
import { issueKeys } from "./queries";
import type { Issue } from "../types";

const qc = new QueryClient();
const issue = { id: "i-1", workspace_id: "ws-a", identifier: "A-1", title: "Existing", status: "todo" } as Issue;
afterEach(() => qc.clear());
describe("cached issue projections", () => {
  it.each([
    { byStatus: { todo: { issues: [issue], total: 1 } } },
    { pages: [{ issues: [issue], total: 1 }], pageParams: [0] },
    { groups: [{ issues: [issue], total: 1 }] },
    { rows: [{ issue, ancestors: [] }] },
    [issue],
  ])("reads the original entity from an existing projection without creating queries", (data) => {
    qc.setQueryData(["issues", "ws-a", "projection"], data);
    expect(findCachedIssue(qc, "ws-a", "i-1")).toBe(issue);
    expect(findCachedIssue(qc, "ws-a", "A-1")).toBe(issue);
    expect(qc.getQueryCache().getAll()).toHaveLength(1);
  });
  it("never uses a different workspace's entity", () => {
    qc.setQueryData(issueKeys.detail("ws-b", "i-1"), issue);
    qc.setQueryData(issueKeys.listSorted("ws-b"), { byStatus: { todo: { issues: [issue] } } });
    expect(findCachedIssue(qc, "ws-b", "i-1")).toBeUndefined();
    expect(findCachedIssue(qc, "ws-a", "i-1")).toBeUndefined();
  });
  it("prefers the canonical detail and sees updates and removal", () => {
    qc.setQueryData(issueKeys.listSorted("ws-a"), { byStatus: { todo: { issues: [issue] } } });
    const detail = { ...issue, title: "Complete", description: "Body" };
    qc.setQueryData(issueKeys.detail("ws-a", "i-1"), detail);
    expect(findCachedIssue(qc, "ws-a", "i-1")).toBe(detail);
    qc.removeQueries({ queryKey: issueKeys.all("ws-a") });
    expect(findCachedIssue(qc, "ws-a", "i-1")).toBeUndefined();
  });
  it("rebuilds the derived index when a Query snapshot changes or removes a row", () => {
    const key = ["issues", "ws-a", "projection"];
    qc.setQueryData(key, { rows: [{ issue }] });
    expect(findCachedIssue(qc, "ws-a", "i-1")).toBe(issue);
    qc.setQueryData(key, { rows: [{ issue: { ...issue, title: "Updated" } }] });
    expect(findCachedIssue(qc, "ws-a", "i-1")?.title).toBe("Updated");
    qc.setQueryData(key, { rows: [] });
    expect(findCachedIssue(qc, "ws-a", "i-1")).toBeUndefined();
  });
});
