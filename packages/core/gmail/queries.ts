import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const gmailKeys = {
  all: ["gmail"] as const,
  connectionLists: () => [...gmailKeys.all, "connections"] as const,
  connections: (workspaceId: string) =>
    [...gmailKeys.connectionLists(), workspaceId] as const,
};

export const gmailConnectionsOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: gmailKeys.connections(workspaceId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ signal });
      return requestApi.listGmailConnections();
    },
    enabled: workspaceId.length > 0,
    staleTime: 30_000,
  });
