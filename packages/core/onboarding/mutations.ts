import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { Agent, CreateAgentRequest, CreateIssueRequest, Issue } from "../types";
import { workspaceKeys } from "../workspace/queries";
import { issueKeys } from "../issues/queries";
import { parseWithFallback } from "../api/schema";
import { IssueSchema } from "../api/schemas";

export const ONBOARDING_HELPER_NAMES = ["iteamify Helper", "AuroSignal Helper", "iTeamify Helper"];

export function usePrepareOnboardingAssistant(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAgentRequest): Promise<Agent> => {
      const requestApi = api.withRequestContext({ workspaceId: wsId });
      const runtimes = await requestApi.listRuntimes({ workspace_id: wsId });
      const online = (id: string) => runtimes.some((runtime) => runtime.id === id && runtime.status === "online");
      if (!online(input.runtime_id)) throw new Error("runtime_unavailable");
      const find = async () => (await requestApi.listAgents({ workspace_id: wsId })).find(
        (agent) => ONBOARDING_HELPER_NAMES.includes(agent.name) && agent.visibility === "workspace" && !agent.archived_at,
      );
      const existing = await find();
      if (existing) {
        if (!online(existing.runtime_id)) throw new Error("runtime_unavailable");
        return existing;
      }
      try {
        return await requestApi.createAgent(input);
      } catch (error) {
        // Concurrent setup may have committed the same helper first.
        if (error instanceof ApiError && error.status === 409) {
          const created = await find();
          if (created && online(created.runtime_id)) return created;
        }
        throw error;
      }
    },
    onSuccess: (agent) => {
      qc.setQueryData<Agent[]>(workspaceKeys.agents(wsId), (old = []) =>
        [...old.filter((entry) => entry.id !== agent.id), agent]);
    },
  });
}

function sameTask(issue: Issue, wsId: string, ownerId: string, input: CreateIssueRequest): boolean {
  return issue.workspace_id === wsId && issue.creator_id === ownerId &&
    issue.title === input.title && (issue.description ?? "") === (input.description ?? "") &&
    issue.assignee_type === "agent" && issue.assignee_id === input.assignee_id;
}

/** Reconcile a lost receipt before retrying, including tasks already completed. */
export function useSubmitOnboardingTask(wsId: string, ownerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, recover }: { input: CreateIssueRequest; recover: boolean }): Promise<Issue> => {
      const requestApi = api.withRequestContext({ workspaceId: wsId });
      if (recover) {
        let offset = 0;
        for (;;) {
          const page = await requestApi.listIssues({
            workspace_id: wsId, creator_id: ownerId, assignee_id: input.assignee_id,
            limit: 100, offset, q: input.title, sort_by: "created_at", sort_direction: "desc",
          }, { strict: true });
          const found = page.issues.find((issue) => sameTask(issue, wsId, ownerId, input));
          if (found) return found;
          offset += page.issues.length;
          if (!page.issues.length || offset >= page.total) break;
        }
      }
      try {
        return await requestApi.createIssue(input);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.body && typeof error.body === "object" &&
            "code" in error.body && error.body.code === "active_duplicate_issue" && "issue" in error.body) {
          const issue = parseWithFallback<Issue | null>(error.body.issue, IssueSchema.nullable(), null, { endpoint: "POST /api/issues duplicate" });
          if (issue && sameTask(issue, wsId, ownerId, input)) return issue;
        }
        throw error;
      }
    },
    onSuccess: (issue) => {
      qc.setQueryData(issueKeys.detail(wsId, issue.id), issue);
      void qc.invalidateQueries({ queryKey: issueKeys.all(wsId) });
    },
  });
}
