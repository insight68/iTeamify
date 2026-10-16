import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

// Local Billing is authoritative. Checkout status polling observes webhook fulfillment.

export const billingKeys = {
  all: () => ["billing"] as const,
  balance: (workspaceId: string) => [...billingKeys.all(), "balance", workspaceId] as const,
  transactions: (workspaceId: string, params?: { page?: number; page_size?: number; cursor?: string }) =>
    [...billingKeys.all(), "transactions", workspaceId, params ?? {}] as const,
  batches: (workspaceId: string, params?: { page?: number; page_size?: number; cursor?: string }) =>
    [...billingKeys.all(), "batches", workspaceId, params ?? {}] as const,
  topups: (workspaceId: string, params?: { page?: number; page_size?: number; cursor?: string }) =>
    [...billingKeys.all(), "topups", workspaceId, params ?? {}] as const,
  priceTiers: (workspaceId: string) =>
    [...billingKeys.all(), "price-tiers", workspaceId] as const,
  checkoutSession: (workspaceId: string, sessionId: string) =>
    [...billingKeys.all(), "checkout-session", workspaceId, sessionId] as const,
};

export function billingBalanceOptions(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.balance(workspaceId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.getCloudBillingBalance(workspaceId);
    },
    // Explicit invalidation after Checkout keeps the wallet fresh on return.
    staleTime: 30 * 1000,
  });
}

export function billingUsageOptions(workspaceId: string, days: number, projectId: string | null, tz: string) {
  return queryOptions({
    queryKey: ["billing", "usage", workspaceId, days, projectId, tz],
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.getWorkspaceCreditUsage(workspaceId, days, projectId, tz);
    },
    staleTime: 30_000,
  });
}

export function billingTransactionsOptions(workspaceId: string, params?: {
  page?: number;
  page_size?: number;
  cursor?: string;
}) {
  return queryOptions({
    queryKey: billingKeys.transactions(workspaceId, params),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.listCloudBillingTransactions(workspaceId, params);
    },
    staleTime: 30 * 1000,
  });
}

export function billingBatchesOptions(workspaceId: string, params?: {
  page?: number;
  page_size?: number;
  cursor?: string;
}) {
  return queryOptions({
    queryKey: billingKeys.batches(workspaceId, params),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.listCloudBillingBatches(workspaceId, params);
    },
    staleTime: 30 * 1000,
  });
}

export function billingTopupsOptions(workspaceId: string, params?: {
  page?: number;
  page_size?: number;
  cursor?: string;
}) {
  return queryOptions({
    queryKey: billingKeys.topups(workspaceId, params),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.listCloudBillingTopups(workspaceId, params);
    },
    staleTime: 30 * 1000,
  });
}

export function billingPriceTiersOptions(workspaceId: string) {
  return queryOptions({
    queryKey: billingKeys.priceTiers(workspaceId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.listCloudBillingPriceTiers(workspaceId);
    },
    // Admin-configured amounts are shared globally.
    staleTime: 5 * 60 * 1000,
  });
}

// Stripe-success-redirect polling: when the page loads with
// `?session_id=...` in the URL, the user just came back from Stripe and
// the topup is racing through `pending → paid → credited`. Poll until
// it's terminal so the UI can show a final outcome before the user
// closes the tab.
//
// Caller is expected to short-circuit by passing `enabled: !!sessionId`
// — that's why we don't gate inside queryOptions itself.
export function billingCheckoutSessionOptions(workspaceId: string, sessionId: string) {
  return queryOptions({
    queryKey: billingKeys.checkoutSession(workspaceId, sessionId),
    queryFn: ({ signal }) => {
      const requestApi = api.withRequestContext({ workspaceId: workspaceId, signal });
      return requestApi.getCloudBillingCheckoutSession(workspaceId, sessionId);
    },
    // Refetch every 2s while we're still in a non-terminal state,
    // stop once we land in `credited` / `failed` / `canceled`.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "credited" || status === "failed" || status === "canceled") {
        return false;
      }
      return 2000;
    },
    staleTime: 0,
  });
}
