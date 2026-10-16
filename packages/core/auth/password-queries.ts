import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAuthStore } from "./index";
import { useConfigStore } from "../config";
import type { AuthProof } from "./schemas";

export const passwordStatusKey = (userId: string) => ["me", "password", userId] as const;

export function usePasswordStatus() {
  const userId = useAuthStore((state) => state.user?.id ?? "");
  const enabled = useConfigStore((state) => state.passwordAuthEnabled);
  return useQuery({
    queryKey: passwordStatusKey(userId),
    queryFn: () => api.getPasswordStatus(),
    enabled: enabled === true && !!userId,
  });
}

export function usePasswordActions() {
  const qc = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? "");
  const requestCode = useMutation({
    mutationFn: (input: { email: string; language: string; purpose?: "set_password" | "reset" }) => api.createAuthChallenge(input.email, input.purpose ?? "set_password", input.language),
  });
  const verifyCode = useMutation({
    mutationFn: (input: { email: string; challenge_id: string; code: string; purpose?: "set_password" | "reset" }) => api.verifyAuthChallenge({ ...input, purpose: input.purpose ?? "set_password" }),
  });
  const save = useMutation({
    mutationFn: (input: { password: string; current_password?: string; language: string } & Partial<AuthProof>) => useAuthStore.getState().changePassword(input),
    onSuccess: () => qc.setQueryData(passwordStatusKey(userId), { has_password: true }),
  });
  const reset = useMutation({
    mutationFn: async (input: AuthProof & { password: string; language: string }) => {
      const generation = useAuthStore.getState().sessionGeneration;
      await api.resetPassword(input);
      const state = useAuthStore.getState();
      if (state.user?.id === userId && state.sessionGeneration === generation) state.sessionExpired();
    },
  });
  return { requestCode, verifyCode, save, reset };
}
