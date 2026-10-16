import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useAuthStore } from "../auth";
import type { UpdateMeRequest, User } from "../types";
import { currentUserKey } from "./cache";
import { setPersonProperties } from "../analytics";
import { readQuestionnaire } from "./questionnaire";

export function acceptCurrentUser(user: User, userId: string, generation: number): User {
  const state = useAuthStore.getState();
  if (state.user?.id !== userId || state.sessionGeneration !== generation) {
    throw new DOMException("Session changed", "AbortError");
  }
  if (user.id !== userId) throw new ApiError("Invalid profile response", 502, "Bad Gateway");
  state.setUser(user);
  return useAuthStore.getState().user!;
}

export function currentUserOptions(userId: string) {
  return queryOptions({
    queryKey: currentUserKey(userId),
    queryFn: async ({ signal }) => {
      const generation = useAuthStore.getState().sessionGeneration;
      const user = await api.withRequestContext({ workspaceId: null, signal }).getMe();
      return acceptCurrentUser(user, userId, generation);
    },
    initialData: () => {
      const user = useAuthStore.getState().user;
      return user?.id === userId ? user : undefined;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    enabled: !!userId,
  });
}

export function useCurrentUser() {
  const userId = useAuthStore((state) => state.user?.id ?? "");
  return useQuery(currentUserOptions(userId));
}

export async function updateCurrentUser(input: UpdateMeRequest, expectedUserId?: string) {
  const state = useAuthStore.getState();
  const userId = expectedUserId ?? state.user?.id;
  if (!userId || state.user?.id !== userId) throw new DOMException("Session changed", "AbortError");
  const generation = state.sessionGeneration;
  const user = await api.withRequestContext({ workspaceId: null }).updateMe(input);
  const accepted = acceptCurrentUser(user, userId, generation);
  if (input.questionnaire) {
    const answers = readQuestionnaire(accepted.onboarding_questionnaire);
    setPersonProperties({ role: answers.role ?? "", use_case: answers.use_case, source: answers.source });
  }
  return accepted;
}

export function useUpdateCurrentUser() {
  const userId = useAuthStore((state) => state.user?.id ?? "");
  return useMutation({
    mutationKey: ["me", userId, "update"],
    scope: { id: `profile:${userId}` },
    mutationFn: (input: UpdateMeRequest) => updateCurrentUser(input, userId),
  });
}
