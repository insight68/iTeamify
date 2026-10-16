import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiInstance, type ApiClient } from "@iteamify/core/api";
import { issueKeys } from "@iteamify/core/issues/queries";
import type { Issue } from "@iteamify/core/types";
import { IssueChip } from "./issue-chip";

vi.mock("@iteamify/core/hooks", () => ({ useWorkspaceId: () => "ws-a" }));
vi.mock("./status-icon", () => ({ StatusIcon: () => <span /> }));
const issue = { id: "i-1", workspace_id: "ws-a", identifier: "A-1", title: "Existing", status: "todo" } as Issue;
let qc: QueryClient;
const getIssue = vi.fn();
const listIssues = vi.fn();
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  getIssue.mockReset().mockResolvedValue(issue); listIssues.mockReset();
  setApiInstance({ withRequestContext() { return this; }, getIssue, listIssues } as unknown as ApiClient);
});
afterEach(() => { cleanup(); qc.clear(); });
function mount() {
  return render(<QueryClientProvider client={qc}><IssueChip issueId="i-1" /></QueryClientProvider>);
}
describe("IssueChip request budget", () => {
  it("makes one detail request and zero list requests on a cold cache", async () => {
    mount();
    await screen.findByText("A-1");
    expect(getIssue).toHaveBeenCalledTimes(1);
    expect(listIssues).not.toHaveBeenCalled();
  });
  it("reuses a table window, reacts to edits, and leaves the detail cache unseeded", async () => {
    const key = ["issues", "ws-a", "table-query", "rows", "page", null];
    qc.setQueryData(key, { rows: [{ issue }] });
    mount();
    expect(screen.getByText("Existing")).toBeInTheDocument();
    expect(getIssue).not.toHaveBeenCalled();
    expect(qc.getQueryData(issueKeys.detail("ws-a", "i-1"))).toBeUndefined();
    act(() => qc.setQueryData(key, { rows: [{ issue: { ...issue, title: "Updated" } }] }));
    await waitFor(() => expect(screen.getByText("Updated")).toBeInTheDocument());
    expect(listIssues).not.toHaveBeenCalled();
  });
});
