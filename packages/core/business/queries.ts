import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const businessKeys = {
  all: (wsId: string) => ["business", wsId] as const,
  context: (wsId: string) => [...businessKeys.all(wsId), "context"] as const,
  releases: (wsId: string) => [...businessKeys.all(wsId), "releases"] as const,
  proposalsAll: (wsId: string) => [...businessKeys.all(wsId), "proposals"] as const,
  proposals: (wsId: string, status: string) =>
    [...businessKeys.proposalsAll(wsId), status] as const,
};

export function businessContextOptions(wsId: string) {
  return queryOptions({
    queryKey: businessKeys.context(wsId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.getBusinessContext();
    },
    enabled: Boolean(wsId),
  });
}

export function businessReleaseListOptions(wsId: string) {
  return queryOptions({
    queryKey: businessKeys.releases(wsId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listBusinessReleases();
    },
    enabled: Boolean(wsId),
  });
}

export function businessProposalListOptions(wsId: string, status = "pending") {
  return queryOptions({
    queryKey: businessKeys.proposals(wsId, status),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listBusinessProposals(status);
    },
    enabled: Boolean(wsId),
  });
}
