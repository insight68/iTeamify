import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const pinKeys = {
  all: (wsId: string, userId: string) => ["pins", wsId, userId] as const,
  list: (wsId: string, userId: string) => [...pinKeys.all(wsId, userId), "list"] as const,
};

export function pinListOptions(wsId: string, userId: string) {
  return queryOptions({
    queryKey: pinKeys.list(wsId, userId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: wsId, signal });
      return requestApi.listPins();
    },
  });
}
