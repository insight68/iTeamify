"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock3, Coins, CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  billingBalanceOptions,
  billingCheckoutSessionOptions,
  billingPriceTiersOptions,
  billingTopupsOptions,
  billingTransactionsOptions,
  useCreateCloudBillingCheckoutSession,
  useInvalidateBillingDataAfterCredit,
} from "@iteamify/core/billing";
import type { BillingPriceTier, BillingTopup, BillingTransaction } from "@iteamify/core/types";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useCurrentMember } from "@iteamify/core/permissions";
import { Button } from "@iteamify/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@iteamify/ui/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@iteamify/ui/components/ui/tabs";
import { useT } from "../i18n";
import { useNavigation } from "../navigation";

const MICRO_PER_CREDIT = 1_000_000;
const CHECKOUT_POLL_TIMEOUT_MS = 60_000;

function useBillingLabel() {
  const { t } = useT("billing");
  const labels: Record<string, string> = {
    pending: t(($) => $.labels.pending),
    credited: t(($) => $.labels.credited),
    canceled: t(($) => $.labels.canceled),
    failed: t(($) => $.labels.failed),
    loading: t(($) => $.labels.loading),
    trial: t(($) => $.labels.trial),
    topup: t(($) => $.labels.topup),
    usage: t(($) => $.labels.usage),
    deduction: t(($) => $.labels.usage),
    adjustment: t(($) => $.labels.adjustment),
  };
  return (value: string) => labels[value] ?? t(($) => $.labels.unknown);
}

export function BillingPage() {
  const { t } = useT("billing");
  const { searchParams, replace, pathname } = useNavigation();
  const workspaceId = useWorkspaceId();
  const { role, isLoading } = useCurrentMember(workspaceId);
  const canManage = role === "owner" || role === "admin";
  const sessionId = searchParams.get("session_id") ?? "";

  if (isLoading) {
    return <div className="grid h-full place-items-center"><Loader2 className="size-4 animate-spin" /></div>;
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-8 p-5 sm:p-8 lg:p-10">
        <header className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Coins className="size-4 text-primary" aria-hidden="true" />
            {t(($) => $.eyebrow)}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t(($) => $.title)}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(($) => $.subtitle)}</p>
        </header>

        {sessionId && (
          <CheckoutStatus
            sessionId={sessionId}
            onDismiss={() => replace(pathname)}
          />
        )}

        <BalanceHero canManage={canManage} />

        {canManage ? <PurchaseSection /> : (
          <Card className="border-dashed shadow-none">
            <CardHeader>
              <CardTitle className="text-base">{t(($) => $.access.title)}</CardTitle>
              <CardDescription>{t(($) => $.access.member_hint)}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {canManage && <BillingHistory />}
      </div>
    </div>
  );
}

function BalanceHero({ canManage }: { canManage: boolean }) {
  const { t } = useT("billing");
  const balance = useQuery(billingBalanceOptions(useWorkspaceId()));
  const value = balance.data?.balance_credit ?? 0;
  const negative = value < 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card px-6 py-7 shadow-sm sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-primary/[.07] blur-3xl" />
      <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t(($) => $.balance.title)}</span>
            <RefreshButton isLoading={balance.isFetching} onClick={() => void balance.refetch()} />
          </div>
          {balance.isLoading ? (
            <Loader2 className="mt-5 size-5 animate-spin" />
          ) : balance.isError ? (
            <div className="mt-4"><ErrorText /></div>
          ) : (
            <>
              <div className={"mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl " + (negative ? "text-destructive" : "")}>
                {formatCredits(value)}
                <span className="ml-2 text-base font-normal tracking-normal text-muted-foreground">{t(($) => $.balance.credits_suffix)}</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {negative ? t(($) => $.balance.negative_hint) : t(($) => $.balance.shared_hint)}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <TrustPoint icon={Clock3} text={t(($) => $.trust.never_expires)} />
          <TrustPoint icon={CreditCard} text={t(($) => $.trust.one_time)} />
          <TrustPoint icon={ShieldCheck} text={t(($) => $.trust.workspace_owned)} />
        </div>
      </div>
      {!canManage && <p className="relative mt-5 border-t pt-4 text-xs text-muted-foreground">{t(($) => $.access.read_only)}</p>}
    </section>
  );
}

function TrustPoint({ icon: Icon, text }: { icon: typeof Clock3; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 text-primary" aria-hidden="true" />{text}</span>;
}

function PurchaseSection() {
  const { t } = useT("billing");
  const workspaceId = useWorkspaceId();
  const tiers = useQuery(billingPriceTiersOptions(workspaceId));
  const checkout = useCreateCloudBillingCheckoutSession(workspaceId);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!selectedId && tiers.data?.[0]) setSelectedId(tiers.data[0].id);
  }, [selectedId, tiers.data]);

  const selected = tiers.data?.find((tier) => tier.id === selectedId);
  const buy = async () => {
    if (!selected) return;
    try {
      const result = await checkout.mutateAsync({ tier_id: selected.id });
      if (!result.url) throw new Error(t(($) => $.buy.toast_no_url));
      window.location.assign(result.url);
    } catch {
      toast.error(t(($) => $.buy.toast_checkout_failed));
    }
  };

  return (
    <section id="purchase" aria-labelledby="purchase-title" className="space-y-5 scroll-mt-6">
      <div className="text-center">
        <h2 id="purchase-title" className="text-xl font-semibold">{t(($) => $.buy.title)}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t(($) => $.buy.subtitle)}</p>
      </div>
      {tiers.isLoading ? (
        <div className="grid min-h-40 place-items-center rounded-xl border"><Loader2 className="size-5 animate-spin" /></div>
      ) : tiers.isError ? (
        <Card><CardContent className="pt-6"><ErrorText /></CardContent></Card>
      ) : !tiers.data?.length ? (
        <Card className="border-dashed shadow-none"><CardContent className="pt-6 text-sm text-muted-foreground">{t(($) => $.buy.no_tiers)}</CardContent></Card>
      ) : (
        <>
          <div role="radiogroup" aria-label={t(($) => $.buy.options_label)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.data.map((tier) => (
              <CreditOption key={tier.id} tier={tier} selected={selectedId === tier.id} onSelect={() => setSelectedId(tier.id)} />
            ))}
          </div>
          <div className="flex flex-col items-center gap-3">
            <Button size="lg" className="min-w-56" disabled={!selected || checkout.isPending} onClick={() => void buy()}>
              {checkout.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
              {checkout.isPending ? t(($) => $.buy.redirecting) : t(($) => $.buy.pay_button)}
            </Button>
            <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {t(($) => $.buy.stripe_note)}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function CreditOption({ tier, selected, onSelect }: { tier: BillingPriceTier; selected: boolean; onSelect: () => void }) {
  const { t } = useT("billing");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={"relative rounded-xl border p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
        (selected ? "border-primary bg-primary/[.04] shadow-sm" : "bg-card hover:border-primary/50")}
    >
      {selected && <span className="absolute right-4 top-4 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span>}
      <div className="text-2xl font-semibold tabular-nums">{formatMoney(tier.amount_cents, "usd")}</div>
      <div className="mt-1 text-xs text-muted-foreground">{t(($) => $.buy.one_time)}</div>
      <div className="mt-5 rounded-lg bg-muted/60 px-3 py-3 text-center">
        <span className="text-xl font-semibold tabular-nums">{formatCredits(tier.credits)}</span>
        <span className="ml-1 text-xs text-muted-foreground">{t(($) => $.balance.credits_suffix)}</span>
      </div>
      <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
        <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" />{t(($) => $.trust.never_expires)}</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" />{t(($) => $.buy.same_rate)}</li>
      </ul>
    </button>
  );
}

function CheckoutStatus({ sessionId, onDismiss }: { sessionId: string; onDismiss: () => void }) {
  const { t } = useT("billing");
  const label = useBillingLabel();
  const workspaceId = useWorkspaceId();
  const [timedOut, setTimedOut] = useState(false);
  const baseOptions = billingCheckoutSessionOptions(workspaceId, sessionId);
  const statusQuery = useQuery({ ...baseOptions, enabled: !timedOut });
  const status = statusQuery.data?.status ?? (statusQuery.isLoading ? "loading" : "");
  const terminal = ["credited", "failed", "canceled"].includes(status);
  const invalidate = useInvalidateBillingDataAfterCredit(workspaceId);

  useEffect(() => {
    if (terminal) invalidate();
  }, [terminal, invalidate]);
  useEffect(() => {
    if (terminal) return;
    const timer = window.setTimeout(() => setTimedOut(true), CHECKOUT_POLL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [terminal, sessionId]);

  const tone = status === "credited" ? "border-emerald-500/35 bg-emerald-500/[.06]" : status === "failed" ? "border-destructive/35 bg-destructive/[.04]" : "border-primary/30 bg-primary/[.04]";
  return (
    <section aria-live="polite" className={"rounded-xl border px-4 py-4 " + tone}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">
            {timedOut ? t(($) => $.checkout.timeout_title) : terminal ? t(($) => $.checkout.final_status, { status: label(status) }) : t(($) => $.checkout.processing)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusQuery.isError ? t(($) => $.checkout.fetch_failed_short) : timedOut ? t(($) => $.checkout.timeout_hint) : t(($) => $.checkout.status_hint)}
          </p>
        </div>
        <div className="flex gap-2">
          {(timedOut || statusQuery.isError) && <Button size="sm" variant="outline" onClick={() => { setTimedOut(false); void statusQuery.refetch(); }}>{t(($) => $.checkout.retry)}</Button>}
          {terminal && <Button size="sm" variant="outline" onClick={onDismiss}>{t(($) => $.checkout.dismiss)}</Button>}
        </div>
      </div>
    </section>
  );
}

function BillingHistory() {
  const { t } = useT("billing");
  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <div>
        <h2 id="history-title" className="text-lg font-semibold">{t(($) => $.history.title)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.history.subtitle)}</p>
      </div>
      <Tabs defaultValue="all">
        <TabsList variant="line">
          <TabsTrigger value="all">{t(($) => $.history.all)}</TabsTrigger>
          <TabsTrigger value="topups">{t(($) => $.history.topups)}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4"><TransactionsList /></TabsContent>
        <TabsContent value="topups" className="mt-4"><TopupsList /></TabsContent>
      </Tabs>
    </section>
  );
}

function TransactionsList() {
  const { t } = useT("billing");
  const [cursors, setCursors] = useState([""]);
  const query = useQuery(billingTransactionsOptions(useWorkspaceId(), { cursor: cursors.at(-1), page_size: 20 }));
  return (
    <HistoryCard loading={query.isLoading} fetching={query.isFetching} error={query.isError} onRefresh={() => void query.refetch()}>
      {query.data?.items.length ? <ul className="divide-y">{query.data.items.map((row) => <TransactionRow key={row.id} row={row} />)}</ul> : <EmptyText>{t(($) => $.transactions.empty)}</EmptyText>}
      <PagingFooter previous={cursors.length > 1} next={query.data?.next_cursor ?? ""} loading={query.isFetching} onPrevious={() => setCursors((v) => v.slice(0, -1))} onNext={(cursor) => setCursors((v) => [...v, cursor])} />
    </HistoryCard>
  );
}

function TransactionRow({ row }: { row: BillingTransaction }) {
  const { t } = useT("billing");
  const label = useBillingLabel();
  const credits = row.amount_micro / MICRO_PER_CREDIT;
  return (
    <li className="flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label(row.source || row.tx_type)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.created_at)}</p>
        {row.reference_id && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">{t(($) => $.transactions.reference, { ref: shortId(row.reference_id) })}</p>}
      </div>
      <div className="text-right">
        <p className={"text-sm font-medium tabular-nums " + (credits >= 0 ? "text-emerald-700 dark:text-emerald-400" : "")}>{credits >= 0 ? "+" : ""}{formatCredits(credits)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{t(($) => $.transactions.balance_after, { balance: formatCredits(row.balance_after / MICRO_PER_CREDIT) })}</p>
      </div>
    </li>
  );
}

function TopupsList() {
  const { t } = useT("billing");
  const [cursors, setCursors] = useState([""]);
  const query = useQuery(billingTopupsOptions(useWorkspaceId(), { cursor: cursors.at(-1), page_size: 20 }));
  return (
    <HistoryCard loading={query.isLoading} fetching={query.isFetching} error={query.isError} onRefresh={() => void query.refetch()}>
      {query.data?.items.length ? <ul className="divide-y">{query.data.items.map((row) => <TopupRow key={row.id} row={row} />)}</ul> : <EmptyText>{t(($) => $.topups.empty)}</EmptyText>}
      <PagingFooter previous={cursors.length > 1} next={query.data?.next_cursor ?? ""} loading={query.isFetching} onPrevious={() => setCursors((v) => v.slice(0, -1))} onNext={(cursor) => setCursors((v) => [...v, cursor])} />
    </HistoryCard>
  );
}

function TopupRow({ row }: { row: BillingTopup }) {
  const { t } = useT("billing");
  const label = useBillingLabel();
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-sm font-medium">{t(($) => $.labels.topup)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.created_at)} · {label(row.status)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium tabular-nums">{formatMoney(row.amount_cents, row.currency)}</p>
          <p className="mt-1 text-xs text-muted-foreground">+{formatCredits(row.credits)} {t(($) => $.balance.credits_suffix)}</p>
        </div>
      </div>
      <details className="mt-2 text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">{t(($) => $.topups.details)}</summary>
        <p className="mt-1 font-mono">{t(($) => $.topups.order_reference, { ref: shortId(row.id) })}</p>
      </details>
    </li>
  );
}

function HistoryCard({ loading, fetching, error, onRefresh, children }: { loading: boolean; fetching: boolean; error: boolean; onRefresh: () => void; children: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-end pb-2">
        <RefreshButton isLoading={fetching} onClick={onRefresh} />
      </CardHeader>
      <CardContent>{loading ? <Loader2 className="size-4 animate-spin" /> : error ? <ErrorText /> : children}</CardContent>
    </Card>
  );
}

function PagingFooter({ previous, next, loading, onPrevious, onNext }: { previous: boolean; next: string; loading: boolean; onPrevious: () => void; onNext: (cursor: string) => void }) {
  const { t } = useT("billing");
  if (!previous && !next) return null;
  return <div className="mt-4 flex justify-end gap-2 border-t pt-4">
    <Button variant="outline" size="sm" disabled={!previous || loading} onClick={onPrevious}>{t(($) => $.shared.previous)}</Button>
    <Button variant="outline" size="sm" disabled={!next || loading} onClick={() => onNext(next)}>{t(($) => $.shared.next)}</Button>
  </div>;
}

function RefreshButton({ isLoading, onClick }: { isLoading: boolean; onClick: () => void }) {
  const { t } = useT("billing");
  return <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} disabled={isLoading} aria-label={t(($) => $.shared.refresh)}><RefreshCw className={"size-3.5 " + (isLoading ? "animate-spin" : "")} /></Button>;
}

function ErrorText() {
  const { t } = useT("billing");
  return <p role="alert" className="text-sm text-destructive">{t(($) => $.shared.request_failed)}</p>;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function formatCredits(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortId(value: string) {
  return value.length > 16 ? value.slice(0, 8) + "…" + value.slice(-4) : value;
}

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return "$" + (amountCents / 100).toFixed(2);
  }
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
