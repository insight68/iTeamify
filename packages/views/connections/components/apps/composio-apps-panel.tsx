"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  AppWindow,
  Check,
  Loader2,
  LockKeyhole,
  Plug,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { Card, CardContent } from "@iteamify/ui/components/ui/card";
import { Input } from "@iteamify/ui/components/ui/input";
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
import { ApiError } from "@iteamify/core/api";
import {
  composioConnectionsOptions,
  composioKeys,
  composioToolkitsOptions,
  useBeginComposioConnect,
  useDeleteComposioConnection,
} from "@iteamify/core/composio";
import type { ComposioConnection, ComposioToolkit } from "@iteamify/core/types";
import { CollectionPageState } from "../../../layout/collection-page";
import { ComposioToolkitLogo } from "../../../common/composio-toolkit-logo";
import { useT, useTimeAgo } from "../../../i18n";
import { useNavigation } from "../../../navigation";
import { ConnectionPanelHeader } from "../connection-panel-header";

const ESSENTIAL_EMAIL_TOOLKIT_SLUGS = new Set(["outlook"]);
const NATIVE_PROVIDER_SLUGS = new Set([
  "feishu",
  "github",
  "gitlab",
  "gmail",
  "lark",
  "slack",
]);

export function ComposioAppsPanel({
  showFullCatalog,
  embedded = false,
}: {
  showFullCatalog: boolean;
  embedded?: boolean;
}) {
  const { t } = useT("connections");
  const qc = useQueryClient();
  const navigation = useNavigation();
  const beginConnect = useBeginComposioConnect();
  const deleteConnection = useDeleteComposioConnection();
  const toolkitsQuery = useQuery(composioToolkitsOptions());
  const connectionsQuery = useQuery(composioConnectionsOptions());

  const query = navigation.searchParams.get("q") ?? "";
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    connectionId: string;
    name: string;
  } | null>(null);

  const connectedParam = navigation.searchParams.get("connected");
  const errorParam = navigation.searchParams.get("error");
  const consumedCallbackKey = useRef<string | null>(null);
  useEffect(() => {
    const callbackKey = connectedParam
      ? `connected:${connectedParam}`
      : errorParam === "composio_connect_failed"
        ? "error:composio_connect_failed"
        : null;
    if (!callbackKey || consumedCallbackKey.current === callbackKey) return;
    consumedCallbackKey.current = callbackKey;
    if (connectedParam) {
      toast.success(t(($) => $.composio.toast_connected));
      void qc.invalidateQueries({ queryKey: composioKeys.connections() });
    } else {
      toast.error(t(($) => $.composio.toast_connect_failed));
    }
    const params = new URLSearchParams(navigation.searchParams);
    params.delete("connected");
    params.delete("error");
    params.delete("view");
    const search = params.toString();
    navigation.replace(
      search ? `${navigation.pathname}?${search}` : navigation.pathname,
    );
    // The callback is intentionally keyed only by one-shot URL values. Including
    // navigation would re-run the effect when replace() publishes new params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedParam, errorParam]);

  const connectionBySlug = useMemo(() => {
    const result = new Map<string, ComposioConnection>();
    for (const connection of connectionsQuery.data ?? []) {
      const existing = result.get(connection.toolkit_slug);
      if (!existing || connection.status === "active") {
        result.set(connection.toolkit_slug, connection);
      }
    }
    return result;
  }, [connectionsQuery.data]);

  const toolkits = useMemo(() => {
    const bySlug = new Map<string, ComposioToolkit>();
    for (const toolkit of toolkitsQuery.data ?? []) bySlug.set(toolkit.slug, toolkit);

    // A revoked server auth config must not make an existing user connection
    // disappear. Render a read-only fallback card even when catalog metadata is
    // no longer available.
    for (const connection of connectionsQuery.data ?? []) {
      if (!bySlug.has(connection.toolkit_slug)) {
        bySlug.set(connection.toolkit_slug, {
          slug: connection.toolkit_slug,
          name: connection.toolkit_slug,
          connectable: false,
        });
      }
    }

    return Array.from(bySlug.values())
      .map((toolkit) =>
        NATIVE_PROVIDER_SLUGS.has(toolkit.slug)
          ? { ...toolkit, connectable: false }
          : toolkit,
      )
      .filter(
        (toolkit) =>
          (!NATIVE_PROVIDER_SLUGS.has(toolkit.slug) ||
            connectionBySlug.has(toolkit.slug)) &&
          (showFullCatalog ||
            ESSENTIAL_EMAIL_TOOLKIT_SLUGS.has(toolkit.slug) ||
            connectionBySlug.has(toolkit.slug)),
      )
      .sort((a, b) => {
        const aConnected = connectionBySlug.has(a.slug) ? 1 : 0;
        const bConnected = connectionBySlug.has(b.slug) ? 1 : 0;
        return bConnected - aConnected || a.name.localeCompare(b.name);
      });
  }, [connectionBySlug, connectionsQuery.data, showFullCatalog, toolkitsQuery.data]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return toolkits;
    return toolkits.filter(
      (toolkit) =>
        toolkit.name.toLowerCase().includes(normalized) ||
        toolkit.slug.toLowerCase().includes(normalized) ||
        (toolkit.category ?? "").toLowerCase().includes(normalized),
    );
  }, [query, toolkits]);

  function handleSearchChange(value: string) {
    const params = new URLSearchParams(navigation.searchParams);
    params.delete("view");
    if (value) params.set("q", value);
    else params.delete("q");
    const search = params.toString();
    navigation.replace(
      search ? `${navigation.pathname}?${search}` : navigation.pathname,
    );
  }

  async function handleConnect(toolkit: ComposioToolkit) {
    if (connectingSlug) return;
    setConnectingSlug(toolkit.slug);
    try {
      const returnParams = new URLSearchParams(navigation.searchParams);
      returnParams.delete("connected");
      returnParams.delete("error");
      returnParams.delete("view");
      const returnSearch = returnParams.toString();
      const { redirect_url } = await beginConnect.mutateAsync({
        toolkitSlug: toolkit.slug,
        returnPath: returnSearch
          ? `${navigation.pathname}?${returnSearch}`
          : navigation.pathname,
      });
      window.location.assign(redirect_url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(($) => $.composio.connect_failed),
      );
      setConnectingSlug(null);
    }
  }

  async function handleDisconnect() {
    if (!disconnectTarget || deleteConnection.isPending) return;
    try {
      await deleteConnection.mutateAsync(disconnectTarget.connectionId);
      toast.success(t(($) => $.composio.toast_disconnected));
      setDisconnectTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(($) => $.composio.disconnect_failed),
      );
    }
  }

  const notConfigured =
    toolkits.length === 0 &&
    ((toolkitsQuery.error instanceof ApiError && toolkitsQuery.error.status === 503) ||
      (connectionsQuery.error instanceof ApiError &&
        connectionsQuery.error.status === 503));

  if (embedded && notConfigured) return null;

  return (
    <div className={embedded ? "space-y-5" : "mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 md:p-8"}>
      {!embedded ? (
        <ConnectionPanelHeader
          icon={AppWindow}
          title={t(($) => $.apps.title)}
          description={
            showFullCatalog
              ? t(($) => $.apps.description)
              : t(($) => $.apps.description_limited)
          }
          scope={t(($) => $.scope.personal)}
        />
      ) : toolkits.length > 0 ? (
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-raised text-muted-foreground">
            <AppWindow aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t(($) => $.unified.more_connections)}</h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              {t(($) => $.unified.more_connections_description)}
            </p>
          </div>
        </div>
      ) : null}

      {!embedded && !showFullCatalog && !notConfigured ? (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm ring-1 ring-border">
            <LockKeyhole aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t(($) => $.apps.easy_connect_title)}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t(($) => $.apps.easy_connect_description)}
            </p>
          </div>
        </div>
      ) : null}

      {notConfigured ? (
        <CollectionPageState
          icon={Plug}
          title={t(($) => $.not_configured_title)}
          description={t(($) => $.not_configured_description)}
        />
      ) : (toolkitsQuery.isLoading && toolkits.length === 0) ||
        connectionsQuery.isLoading ? (
        <CollectionPageState
          role="status"
          icon={Loader2}
          title={t(($) => $.loading)}
          className="[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none"
        />
      ) : toolkitsQuery.isError && toolkits.length === 0 ? (
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertTriangle}
          title={t(($) => $.load_failed)}
          description={t(($) => $.retry_description)}
          actions={
            <Button variant="outline" onClick={() => void toolkitsQuery.refetch()}>
              <RefreshCw aria-hidden="true" className="size-3.5" />
              {t(($) => $.retry)}
            </Button>
          }
        />
      ) : toolkits.length === 0 ? (
        <CollectionPageState
          icon={AppWindow}
          title={t(($) => $.composio.empty_title)}
          description={t(($) => $.composio.empty_description)}
        />
      ) : (
        <section className="space-y-4" aria-labelledby="connected-apps-heading">
          <h2 id="connected-apps-heading" className="sr-only">
            {t(($) => $.apps.catalog_title)}
          </h2>
          {showFullCatalog || toolkits.length > 6 ? (
            <div className="relative max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                name="connection_search"
                autoComplete="off"
                spellCheck={false}
                aria-label={t(($) => $.composio.search_label)}
                value={query}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder={t(($) => $.composio.search_placeholder)}
                className="pl-9"
              />
            </div>
          ) : null}

          {connectionsQuery.isError ? (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <p className="text-xs leading-5 text-destructive">
                {t(($) => $.composio.connections_load_failed)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void connectionsQuery.refetch()}
              >
                {t(($) => $.retry)}
              </Button>
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <CollectionPageState
              icon={Search}
              title={t(($) => $.composio.no_results_title)}
              description={t(($) => $.composio.no_results_description)}
              className="py-12"
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((toolkit) => {
                const connection = connectionBySlug.get(toolkit.slug);
                return (
                  <ToolkitCard
                    key={toolkit.slug}
                    toolkit={toolkit}
                    connection={connection}
                    connecting={connectingSlug === toolkit.slug}
                    anyConnecting={connectingSlug !== null}
                    onConnect={() => void handleConnect(toolkit)}
                    onDisconnect={(connectionId, name) =>
                      setDisconnectTarget({ connectionId, name })
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      <AlertDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteConnection.isPending) setDisconnectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(($) => $.composio.disconnect_confirm_title)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.composio.disconnect_confirm_description, {
                app: disconnectTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConnection.isPending}>
              {t(($) => $.composio.disconnect_confirm_cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDisconnect()}
              disabled={deleteConnection.isPending}
            >
              {deleteConnection.isPending
                ? t(($) => $.composio.disconnecting)
                : t(($) => $.composio.disconnect)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToolkitCard({
  toolkit,
  connection,
  connecting,
  anyConnecting,
  onConnect,
  onDisconnect,
}: {
  toolkit: ComposioToolkit;
  connection?: ComposioConnection;
  connecting: boolean;
  anyConnecting: boolean;
  onConnect: () => void;
  onDisconnect: (connectionId: string, name: string) => void;
}) {
  const { t } = useT("connections");
  const timeAgo = useTimeAgo();
  const name = toolkit.name || toolkit.slug;
  const isLegacyNative = NATIVE_PROVIDER_SLUGS.has(toolkit.slug);
  const isConnected = connection?.status === "active";
  const isExpired = connection?.status === "expired";
  const providerDescription =
    toolkit.slug === "gmail"
      ? t(($) => $.composio.gmail_description)
      : toolkit.slug === "outlook"
        ? t(($) => $.composio.outlook_description)
        : null;

  return (
    <Card className="[content-visibility:auto] [contain-intrinsic-size:72px]">
      <CardContent className="flex min-w-0 items-center gap-3 p-4">
        <ComposioToolkitLogo
          slug={toolkit.slug}
          name={name}
          fallbackLogo={toolkit.logo}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          {isConnected ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {isLegacyNative
                ? t(($) => $.composio.legacy_connection)
                : connection.last_used_at
                ? t(($) => $.composio.last_used, {
                    when: timeAgo(connection.last_used_at),
                  })
                : t(($) => $.composio.last_used_never)}
            </p>
          ) : providerDescription ? (
            <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
              {providerDescription}
            </p>
          ) : toolkit.category ? (
            <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {toolkit.category}
            </p>
          ) : null}
        </div>

        {isConnected && connection ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-success sm:inline-flex">
              <Check aria-hidden="true" className="size-3" />
              {t(($) => $.composio.connected)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onDisconnect(connection.id, name)}
              aria-label={t(($) => $.composio.disconnect_app_aria, { app: name })}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        ) : isExpired && connection && isLegacyNative ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-warning sm:inline-flex">
              <AlertTriangle aria-hidden="true" className="size-3" />
              {t(($) => $.composio.expired)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onDisconnect(connection.id, name)}
              aria-label={t(($) => $.composio.disconnect_app_aria, { app: name })}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        ) : isExpired ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-warning sm:inline-flex">
              <AlertTriangle aria-hidden="true" className="size-3" />
              {t(($) => $.composio.expired)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={onConnect}
              disabled={anyConnecting || !toolkit.connectable}
            >
              {connecting ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <RefreshCw aria-hidden="true" className="size-3" />
              )}
              {connecting
                ? t(($) => $.composio.connecting)
                : t(($) => $.composio.reconnect)}
            </Button>
          </div>
        ) : toolkit.connectable ? (
          <Button size="sm" onClick={onConnect} disabled={anyConnecting}>
            {connecting ? (
              <Loader2
                aria-hidden="true"
                className="size-3 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Plug aria-hidden="true" className="size-3" />
            )}
            {connecting
              ? t(($) => $.composio.connecting)
              : t(($) => $.composio.connect)}
          </Button>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t(($) => $.composio.unavailable)}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
