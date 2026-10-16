"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Inbox,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { Card, CardContent } from "@iteamify/ui/components/ui/card";
import { Switch } from "@iteamify/ui/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@iteamify/ui/components/ui/alert-dialog";
import {
  gmailConnectionsOptions,
  gmailKeys,
  useBeginGmailConnect,
  useDeleteGmailConnection,
  useUpdateGmailAnalysis,
} from "@iteamify/core/gmail";
import { useWorkspaceId } from "@iteamify/core/hooks";
import type { GmailConnection } from "@iteamify/core/types";
import { useT, useTimeAgo } from "../../../i18n";
import { useNavigation } from "../../../navigation";
import { openExternal } from "../../../platform/open-external";

export function GmailConnections() {
  const { t } = useT("connections");
  const navigation = useNavigation();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const connectionsQuery = useQuery(gmailConnectionsOptions(workspaceId));
  const beginConnect = useBeginGmailConnect();
  const updateAnalysis = useUpdateGmailAnalysis();
  const deleteConnection = useDeleteGmailConnection();
  const [disconnectTarget, setDisconnectTarget] = useState<GmailConnection | null>(null);
  const callbackKey = `${navigation.searchParams.get("gmail_connected") ?? ""}:${navigation.searchParams.get("gmail_error") ?? ""}`;
  const consumedCallback = useRef("");

  useEffect(() => {
    if (callbackKey === ":" || consumedCallback.current === callbackKey) return;
    consumedCallback.current = callbackKey;
    if (navigation.searchParams.get("gmail_connected")) {
      toast.success(t(($) => $.gmail.toast_connected));
      void queryClient.invalidateQueries({ queryKey: gmailKeys.connectionLists() });
    } else {
      toast.error(navigation.searchParams.get("gmail_error") === "scopes_required" ? t(($) => $.gmail.toast_scopes_required) : t(($) => $.gmail.toast_connect_failed));
    }
    const params = new URLSearchParams(navigation.searchParams);
    params.delete("gmail_connected");
    params.delete("gmail_error");
    params.delete("view");
    const search = params.toString();
    navigation.replace(search ? `${navigation.pathname}?${search}` : navigation.pathname);
    // Callback query values are intentionally consumed only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackKey]);

  async function handleConnect() {
    if (beginConnect.isPending) return;
    try {
      const { redirect_url: redirectURL } = await beginConnect.mutateAsync(
        navigation.pathname,
      );
      if (!redirectURL) throw new Error(t(($) => $.gmail.connect_failed));
      openExternal(redirectURL, { sameTabOnWeb: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.gmail.connect_failed));
    }
  }

  async function handleAnalysis(connection: GmailConnection, enabled: boolean) {
    try {
      await updateAnalysis.mutateAsync({ connectionId: connection.id, enabled });
      toast.success(
        enabled
          ? t(($) => $.gmail.analysis_enabled_toast)
          : t(($) => $.gmail.analysis_disabled_toast),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.gmail.analysis_update_failed));
    }
  }

  async function handleDisconnect() {
    if (!disconnectTarget || deleteConnection.isPending) return;
    try {
      await deleteConnection.mutateAsync(disconnectTarget.id);
      toast.success(t(($) => $.gmail.toast_disconnected));
      setDisconnectTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.gmail.disconnect_failed));
    }
  }

  const configured = connectionsQuery.data?.configured === true;
  const connections = connectionsQuery.data?.connections ?? [];

  return (
    <section id="gmail" className="scroll-mt-6 space-y-3" aria-labelledby="gmail-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <GmailMark />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="gmail-heading" className="text-sm font-semibold">
                {t(($) => $.gmail.provider_name)}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                <ShieldCheck aria-hidden="true" className="size-3" />
                {t(($) => $.gmail.native_badge)}
              </span>
            </div>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground text-pretty">
              {t(($) => $.gmail.description)}
            </p>
          </div>
        </div>
        {configured ? (
          <Button size="sm" onClick={() => void handleConnect()} disabled={beginConnect.isPending}>
            {beginConnect.isPending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus aria-hidden="true" className="size-3.5" />
            )}
            {connections.length > 0 ? t(($) => $.gmail.add_account) : t(($) => $.gmail.connect)}
          </Button>
        ) : null}
      </div>

      {connectionsQuery.isLoading ? (
        <ConnectionNotice icon={Loader2} title={t(($) => $.loading)} spin />
      ) : connectionsQuery.isError ? (
        <ConnectionNotice
          icon={AlertTriangle}
          title={t(($) => $.gmail.load_failed)}
          action={
            <Button variant="outline" size="sm" onClick={() => void connectionsQuery.refetch()}>
              <RefreshCw aria-hidden="true" className="size-3.5" />
              {t(($) => $.retry)}
            </Button>
          }
        />
      ) : !configured ? (
        <ConnectionNotice icon={Mail} title={t(($) => $.gmail.not_configured)} />
      ) : connections.length === 0 ? (
        <Card className="border-dashed bg-gradient-to-br from-background to-muted/25">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Inbox aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{t(($) => $.gmail.empty_title)}</p>
                <p className="mt-0.5 max-w-xl text-xs leading-5 text-muted-foreground">
                  {t(($) => $.gmail.empty_description)}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => void handleConnect()} disabled={beginConnect.isPending}>
              {t(($) => $.gmail.connect)}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {connections.map((connection) => (
            <GmailAccountCard
              key={connection.id}
              connection={connection}
              analysisPending={updateAnalysis.isPending}
              onAnalysis={(enabled) => void handleAnalysis(connection, enabled)}
              onDisconnect={() => setDisconnectTarget(connection)}
            />
          ))}
        </div>
      )}

      {configured && !connectionsQuery.data?.analysis_configured ? (
        <ConnectionNotice icon={AlertTriangle} title={t(($) => $.gmail.analysis_not_configured)} />
      ) : null}

      <AlertDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteConnection.isPending) setDisconnectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.gmail.disconnect_confirm_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.gmail.disconnect_confirm_description, {
                email: disconnectTarget?.email_address ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConnection.isPending}>
              {t(($) => $.gmail.disconnect_cancel)}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDisconnect()} disabled={deleteConnection.isPending}>
              {deleteConnection.isPending ? t(($) => $.gmail.disconnecting) : t(($) => $.gmail.disconnect)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function GmailAccountCard({
  connection,
  analysisPending,
  onAnalysis,
  onDisconnect,
}: {
  connection: GmailConnection;
  analysisPending: boolean;
  onAnalysis: (enabled: boolean) => void;
  onDisconnect: () => void;
}) {
  const { t } = useT("connections");
  const timeAgo = useTimeAgo();
  const healthy = connection.status === "active";
  return (
    <Card className="overflow-hidden [content-visibility:auto] [contain-intrinsic-size:156px]">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <GmailMark compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={connection.email_address}>
              {connection.email_address}
            </p>
            <p className={`mt-0.5 inline-flex items-center gap-1 text-xs ${healthy ? "text-success" : "text-warning"}`}>
              {healthy ? <Check aria-hidden="true" className="size-3" /> : <AlertTriangle aria-hidden="true" className="size-3" />}
              {healthy ? t(($) => $.gmail.connected) : t(($) => $.gmail.needs_attention)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{connection.can_send ? t(($) => $.gmail.send_ready) : t(($) => $.gmail.send_unavailable)}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onDisconnect} aria-label={t(($) => $.gmail.disconnect_account_aria, { email: connection.email_address })}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/35 p-3 text-center">
          <Metric value={connection.message_count} label={t(($) => $.gmail.received)} />
          <Metric value={connection.analyzed_count} label={t(($) => $.gmail.analyzed)} />
          <Metric
            value={connection.last_sync_at ? timeAgo(connection.last_sync_at) : "—"}
            label={t(($) => $.gmail.last_sync)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-surface-border pt-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">{t(($) => $.gmail.auto_analysis)}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {t(($) => $.gmail.auto_analysis_description)}
            </p>
          </div>
          <Switch
            size="sm"
            checked={connection.analysis_enabled}
            onCheckedChange={onAnalysis}
            disabled={analysisPending}
            aria-label={t(($) => $.gmail.analysis_toggle_aria, { email: connection.email_address })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function GmailMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-gradient-to-br from-red-50 to-white text-red-600 shadow-xs dark:border-red-950 dark:from-red-950/50 dark:to-background ${compact ? "size-9" : "size-10"}`}>
      <Mail aria-hidden="true" className={compact ? "size-4" : "size-[18px]"} />
    </span>
  );
}

function ConnectionNotice({
  icon: Icon,
  title,
  action,
  spin = false,
}: {
  icon: typeof Mail;
  title: string;
  action?: ReactNode;
  spin?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-muted/20 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground ${spin ? "animate-spin motion-reduce:animate-none" : ""}`} />
        <p className="text-xs leading-5 text-muted-foreground">{title}</p>
      </div>
      {action}
    </div>
  );
}
