import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CreateBillingCheckoutSessionRequest } from "../types";
import { billingKeys } from "./queries";

// Checkout redirects to Stripe. The local webhook credits the wallet after payment.
// Keep the request identity across failed attempts; refresh orders on completion.

export function useCreateCloudBillingCheckoutSession(workspaceId: string) {
  const qc = useQueryClient();
  const attempts = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: (data: CreateBillingCheckoutSessionRequest) => {
      const identity = workspaceId + ":" + data.tier_id;
      const key = data.request_key ?? attempts.current.get(identity) ?? crypto.randomUUID();
      attempts.current.set(identity, key);
      return api.createCloudBillingCheckoutSession(workspaceId, { ...data, request_key: key });
    },
    onSuccess: (_response, data) => {
      attempts.current.delete(workspaceId + ":" + data.tier_id);
    },
    onSettled: () => {
      // The pending order is already persisted locally.
      qc.invalidateQueries({ queryKey: [...billingKeys.all(), "topups", workspaceId] });
    },
  });
}

export function useCreateCloudBillingPortalSession(workspaceId: string) {
  return useMutation({
    mutationFn: () => api.createCloudBillingPortalSession(workspaceId),
    // No cache invalidation — the portal opens, the user does whatever,
    // and any state changes Stripe-side propagate back via webhook.
    // The next React Query refetch picks them up at its own cadence.
  });
}

/** Refresh local wallet and ledger projections after Checkout reaches a terminal state. */
export function useInvalidateBillingDataAfterCredit(workspaceId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: billingKeys.balance(workspaceId) });
    qc.invalidateQueries({ queryKey: [...billingKeys.all(), "usage", workspaceId] });
    qc.invalidateQueries({ queryKey: [...billingKeys.all(), "transactions", workspaceId] });
    qc.invalidateQueries({ queryKey: [...billingKeys.all(), "topups", workspaceId] });
  }, [qc, workspaceId]);
}
