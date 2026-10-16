import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type {
  ApplyBusinessProposalResponse,
  BusinessContextState,
  BusinessContent,
  PublishBusinessResponse,
} from "../types";
import { businessKeys } from "./queries";

export function useSaveBusinessDraft() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedRevision: number; content: BusinessContent }) =>
      api.saveBusinessDraft({
        expected_revision: input.expectedRevision,
        content: input.content,
      }),
    onSuccess: (context: BusinessContextState) => {
      queryClient.setQueryData(businessKeys.context(wsId), context);
      queryClient.invalidateQueries({ queryKey: businessKeys.proposalsAll(wsId) });
    },
  });
}

export function useSaveBusinessProfile() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedRevision: number; content: BusinessContent; changeSummary?: string }) =>
      api.saveBusinessProfile({
        expected_revision: input.expectedRevision,
        content: input.content,
        change_summary: input.changeSummary,
      }),
    onSuccess: (context: BusinessContextState) => {
      queryClient.setQueryData(businessKeys.context(wsId), context);
    },
  });
}

export function usePublishBusiness() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expectedRevision: number; changeSummary: string }) =>
      api.publishBusiness({
        expected_revision: input.expectedRevision,
        change_summary: input.changeSummary,
      }),
    onSuccess: (result: PublishBusinessResponse) => {
      queryClient.setQueryData(businessKeys.context(wsId), result.context);
      queryClient.invalidateQueries({ queryKey: businessKeys.releases(wsId) });
    },
  });
}

export function useApplyBusinessProposal() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; expectedRevision: number }) =>
      api.applyBusinessProposal(input.proposalId, input.expectedRevision),
    onSuccess: (result: ApplyBusinessProposalResponse) => {
      queryClient.setQueryData(businessKeys.context(wsId), result.context);
      queryClient.invalidateQueries({ queryKey: businessKeys.proposalsAll(wsId) });
    },
  });
}

export function useRejectBusinessProposal() {
  const wsId = useWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; reason?: string }) =>
      api.rejectBusinessProposal(input.proposalId, input.reason ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: businessKeys.proposalsAll(wsId) });
    },
  });
}
