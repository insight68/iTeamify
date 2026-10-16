import { z } from "zod";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { createDraftStore } from "../drafts";
import { teamKeys } from "../team/queries";
import { chatKeys } from "../chat/queries";

export * from "./schemas";
export * from "./applications";
import { contractFieldsSchema, type ContractFields, type CreateContractReviewInput, type ContractActionInput, type ContractReview } from "./schemas";

export const containerKeys = { all: (wsId: string) => ["session-containers", wsId] as const, review: (wsId: string, userId: string, id: string) => ["session-containers", wsId, "contract-review", userId, id] as const };
export function contractReviewOptions(wsId: string, userId: string, sessionId: string) {
  return queryOptions<ContractReview>({ queryKey: containerKeys.review(wsId, userId, sessionId), enabled: !!wsId && !!sessionId && !!userId, refetchInterval: (query) => query.state.data?.task && ["queued", "dispatched", "running", "deferred", "waiting"].includes(query.state.data.task.status) ? 2000 : false,
    queryFn: ({ signal }) => api.withRequestContext({ workspaceId: wsId, signal }).getContractReview(sessionId),
  });
}
function useRefreshContainers(wsId: string) {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: containerKeys.all(wsId) }), qc.invalidateQueries({ queryKey: teamKeys.all(wsId) }), qc.invalidateQueries({ queryKey: chatKeys.all(wsId) })]);
}
export function useCreateContractReview(wsId: string) {
  const refresh = useRefreshContainers(wsId);
  return useMutation({ mutationFn: ({ input, files }: { input: CreateContractReviewInput; files: File[] }) => api.withRequestContext({ workspaceId: wsId }).createContractReview(input, files), onSuccess: refresh });
}
export function useContractReviewAction(wsId: string, id: string) {
  const refresh = useRefreshContainers(wsId);
  return useMutation({ mutationFn: ({ input, files = [] }: { input: ContractActionInput; files?: File[] }) => api.withRequestContext({ workspaceId: wsId }).contractReviewAction(id, input, files), onSuccess: refresh, onError: (error) => { if (error instanceof ApiError && error.status === 409) refresh(); } });
}
export function useReadContractReview(wsId: string, id: string) {
  const refresh = useRefreshContainers(wsId);
  return useMutation({ mutationFn: (version: number) => api.withRequestContext({ workspaceId: wsId }).markContractReviewRead(id, version), onSuccess: refresh });
}
export function useDownloadContractFile(wsId: string) {
  return useMutation({ mutationFn: (id: string) => api.withRequestContext({ workspaceId: wsId }).downloadContractReviewFile(id) });
}

export const EMPTY_CONTRACT_FIELDS: ContractFields = { title: "", contract_type: "", priority: "normal", deadline: "", opportunity_stage: "", background: "", focus: "" };
export const useContractDraftStore = createDraftStore<{ fields: Record<string, ContractFields> }>({ storageKey: "iteamify:contract-review:drafts", emptyData: { fields: {} }, hasMeaningful: (d) => Object.values(d.fields).some((f) => !!f.title || !!f.background || !!f.focus),
  migrateData: (raw) => {
    const result = z.object({ fields: z.record(z.string(), contractFieldsSchema) }).safeParse(raw);
    return result.success ? result.data : { fields: {} };
  },
});
export function setContractDraft(key: string, fields: ContractFields) { const store = useContractDraftStore.getState(); store.setDraft({ fields: { ...store.draft.fields, [key]: fields } }); }
export function removeContractDraft(key: string) { const store = useContractDraftStore.getState(); const fields = { ...store.draft.fields }; delete fields[key]; store.setDraft({ fields }); }
