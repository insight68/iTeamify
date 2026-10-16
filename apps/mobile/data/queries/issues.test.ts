import { describe, expect, it, vi } from "vitest";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type { Issue } from "@iteamify/core/types";
vi.mock("@/data/api", () => ({ api: { listIssues: vi.fn() } }));
import { api } from "@/data/api";
import { issueKeys, issueListOptions, loadedIssues, type IssuePages } from "./issues";
import { patchIssuesList, patchMyIssuesList, prependToIssuesList } from "../realtime/issue-ws-updaters";

describe("paginated issue lists", () => {
  it("can reach all 251 issues and sends filters to every page request", async () => {
    const rows = Array.from({ length: 251 }, (_, i) => ({ id: String(i), status: "in_progress" }) as Issue);
    vi.mocked(api.listIssues).mockImplementation(async (params) => ({
      issues: rows.slice(params?.offset ?? 0, (params?.offset ?? 0) + (params?.limit ?? 0)), total: rows.length,
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new InfiniteQueryObserver(qc, issueListOptions("ws", { status: "in_progress", project_id: "project" }));
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    while (observer.getCurrentResult().hasNextPage) await observer.fetchNextPage();
    expect(loadedIssues(observer.getCurrentResult().data)).toHaveLength(251);
    expect(api.listIssues).toHaveBeenLastCalledWith({ status: "in_progress", project_id: "project", offset: 250, limit: 50 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    unsubscribe();
    qc.clear();
  });

  it("patches loaded pages across filters while the server recomputes membership and totals", () => {
    const qc = new QueryClient();
    const listKey = [...issueKeys.list("ws"), { status: "todo" }];
    const projectKey = [...issueKeys.list("ws"), "byProject", "project"];
    const myKey = [...issueKeys.myAll("ws"), "assigned"];
    const data: IssuePages = { pages: [{ issues: [{ id: "a", status: "todo" } as Issue], total: 120 }, { issues: [{ id: "b", status: "todo" } as Issue], total: 120 }], pageParams: [0, 50] };
    for (const key of [listKey, projectKey, myKey]) qc.setQueryData(key, data);
    patchIssuesList(qc, "ws", { id: "b", status: "done" });
    patchMyIssuesList(qc, "ws", { id: "b", status: "done" });
    for (const key of [listKey, projectKey, myKey]) {
      expect(loadedIssues(qc.getQueryData<IssuePages>(key))[1].status).toBe("done");
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
      expect(qc.getQueryData<IssuePages>(key)?.pageParams).toEqual([0, 50]);
    }
    prependToIssuesList(qc, "ws", { id: "other-project" } as Issue);
    expect(loadedIssues(qc.getQueryData<IssuePages>(projectKey)).map((issue) => issue.id)).toEqual(["a", "b"]);
    qc.clear();
  });
});
