"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Copy, GitBranch, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { Card, CardContent } from "@iteamify/ui/components/ui/card";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@iteamify/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iteamify/ui/components/ui/select";
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
import { useWorkspaceId } from "@iteamify/core/hooks";
import {
  useConnectVCS,
  useDeleteVCSConnection,
  useRotateVCSWebhook,
  vcsConnectionsOptions,
} from "@iteamify/core/vcs";
import type { ConnectVCSResponse, VCSProvider } from "@iteamify/core/types";
import { CollectionPageState } from "../../../layout/collection-page";
import { useT } from "../../../i18n";
import { ConnectionPanelHeader } from "../connection-panel-header";

const PROVIDERS: VCSProvider[] = ["forgejo", "gitea", "gitlab"];
const PROVIDER_LABELS: Record<VCSProvider, string> = {
  forgejo: "Forgejo",
  gitea: "Gitea",
  gitlab: "GitLab",
};
const PROVIDER_OPTIONS = PROVIDERS.map((p) => ({
  value: p,
  label: PROVIDER_LABELS[p],
}));

export function SourceControlPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useT("settings");
  const { t: tc } = useT("connections");
  const wsId = useWorkspaceId();
  const connectVCS = useConnectVCS(wsId);
  const rotateWebhook = useRotateVCSWebhook(wsId);
  const deleteConnection = useDeleteVCSConnection(wsId);

  const { data, isLoading, isError, refetch } = useQuery(vcsConnectionsOptions(wsId));
  const connections = data?.connections ?? [];
  const configured = data?.configured === true;
  const canManage = data?.can_manage === true;

  const [provider, setProvider] = useState<VCSProvider>("forgejo");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [token, setToken] = useState("");
  const [justConnected, setJustConnected] = useState<ConnectVCSResponse | null>(null);
  const [rotateTarget, setRotateTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  async function handleConnect() {
    if (connectVCS.isPending || !instanceUrl.trim() || !token.trim()) return;
    try {
      const resp = await connectVCS.mutateAsync({
        provider,
        instance_url: instanceUrl.trim(),
        access_token: token.trim(),
      });
      setJustConnected(resp);
      setInstanceUrl("");
      setToken("");
      setConnectDialogOpen(false);
      toast.success(t(($) => $.vcs.toast_connected));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.vcs.toast_connect_failed));
    }
  }

  async function handleRotateWebhook() {
    if (!rotateTarget || rotateWebhook.isPending) return;
    try {
      const resp = await rotateWebhook.mutateAsync(rotateTarget);
      setJustConnected(resp);
      setRotateTarget(null);
      toast.success(t(($) => $.vcs.toast_rotated));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.vcs.toast_rotate_failed));
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleteConnection.isPending) return;
    try {
      await deleteConnection.mutateAsync(deleteTarget);
      if (justConnected?.id === deleteTarget) setJustConnected(null);
      toast.success(t(($) => $.vcs.toast_disconnected));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.vcs.toast_disconnect_failed));
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t(($) => $.vcs.copied));
    } catch {
      toast.error(t(($) => $.vcs.copy_failed));
    }
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 md:p-8"}>
      <ConnectionPanelHeader
        icon={GitBranch}
        title={tc(($) => $.code.title)}
        description={tc(($) => $.code.description)}
        scope={tc(($) => $.scope.workspace)}
      />

      {canManage && configured ? (
        <div className="flex justify-end">
          <Button onClick={() => setConnectDialogOpen(true)}>
            <Plus aria-hidden="true" className="size-3.5" />
            {t(($) => $.vcs.connect_title)}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <CollectionPageState
          role="status"
          icon={GitBranch}
          title={t(($) => $.vcs.loading)}
        />
      ) : isError ? (
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertTriangle}
          title={t(($) => $.vcs.load_failed)}
          description={tc(($) => $.retry_description)}
          actions={
            <Button variant="outline" onClick={() => void refetch()}>
              <RefreshCw aria-hidden="true" className="size-3.5" />
              {tc(($) => $.retry)}
            </Button>
          }
        />
      ) : null}

      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground shrink-0">
                    <GitBranch className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium break-all">
                      {(PROVIDER_LABELS[c.provider] ?? c.provider) + " · " + c.instance_url}
                    </p>
                    <p className="text-xs text-muted-foreground break-all">
                      {t(($) => $.vcs.connected_as, { login: c.account_login })}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRotateTarget(c.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {t(($) => $.vcs.regenerate_webhook)}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(c.id)}>
                      <Trash2 className="h-3 w-3" />
                      {t(($) => $.vcs.disconnect)}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && !configured ? (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">{t(($) => $.vcs.not_configured_title)}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {t(($) => $.vcs.not_configured)}{" "}
              <code translate="no" className="rounded bg-muted px-1 py-0.5 text-[10px]">
                ITEAMIFY_VCS_SECRET_KEY
              </code>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!canManage && connections.length === 0 && (
        <p className="text-xs text-muted-foreground">{t(($) => $.vcs.contact_admin)}</p>
      )}

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleConnect();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t(($) => $.vcs.connect_title)}</DialogTitle>
              <DialogDescription>{t(($) => $.vcs.page_description)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="vcs-provider">{t(($) => $.vcs.form_provider_label)}</Label>
                <Select
                  items={PROVIDER_OPTIONS}
                  value={provider}
                  onValueChange={(value) => setProvider(value as VCSProvider)}
                >
                  <SelectTrigger id="vcs-provider" disabled={connectVCS.isPending}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((providerName) => (
                      <SelectItem key={providerName} value={providerName}>
                        {PROVIDER_LABELS[providerName]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vcs-url">{t(($) => $.vcs.form_instance_url_label)}</Label>
                <Input
                  id="vcs-url"
                  name="vcs_instance_url"
                  type="url"
                  autoComplete="url"
                  spellCheck={false}
                  required
                  placeholder="https://forgejo.example.com…"
                  value={instanceUrl}
                  onChange={(event) => setInstanceUrl(event.target.value)}
                  disabled={connectVCS.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vcs-token">{t(($) => $.vcs.form_token_label)}</Label>
                <Input
                  id="vcs-token"
                  name="vcs_access_token"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  required
                  placeholder={t(($) => $.vcs.form_token_placeholder)}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  disabled={connectVCS.isPending}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(($) => $.vcs.form_token_hint)}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={connectVCS.isPending}
                onClick={() => setConnectDialogOpen(false)}
              >
                {t(($) => $.vcs.connect_cancel)}
              </Button>
              <Button type="submit" disabled={connectVCS.isPending}>
                {connectVCS.isPending ? t(($) => $.vcs.connecting) : t(($) => $.vcs.connect)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={justConnected !== null}
        onOpenChange={(open) => {
          if (!open) setJustConnected(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t(($) => $.vcs.webhook_setup_title)}</DialogTitle>
            <DialogDescription>
              {t(($) => $.vcs.webhook_setup_description)}
            </DialogDescription>
          </DialogHeader>
          {justConnected ? (
            <div className="space-y-4 py-2">
              <CopyField
                id="vcs-webhook-url"
                label={t(($) => $.vcs.webhook_url_label)}
                value={justConnected.webhook_url || justConnected.webhook_path}
                onCopy={copy}
                copyLabel={t(($) => $.vcs.copy)}
              />
              <CopyField
                id="vcs-webhook-secret"
                label={t(($) => $.vcs.webhook_secret_label)}
                value={justConnected.webhook_secret}
                onCopy={copy}
                copyLabel={t(($) => $.vcs.copy)}
                mono
              />
              <p role="alert" className="text-xs leading-5 text-warning">
                {t(($) => $.vcs.webhook_secret_warning)}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setJustConnected(null)}>
              {t(($) => $.vcs.webhook_done)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!rotateTarget}
        onOpenChange={(v) => {
          if (!v && !rotateWebhook.isPending) setRotateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.vcs.rotate_confirm_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.vcs.rotate_confirm_description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotateWebhook.isPending}>
              {t(($) => $.vcs.rotate_confirm_cancel)}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateWebhook} disabled={rotateWebhook.isPending}>
              {rotateWebhook.isPending ? t(($) => $.vcs.rotating) : t(($) => $.vcs.rotate_confirm_action)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v && !deleteConnection.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.vcs.disconnect_confirm_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.vcs.disconnect_confirm_description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConnection.isPending}>
              {t(($) => $.vcs.disconnect_confirm_cancel)}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteConnection.isPending}>
              {deleteConnection.isPending ? t(($) => $.vcs.disconnecting) : t(($) => $.vcs.disconnect_confirm_action)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CopyField({
  id,
  label,
  value,
  onCopy,
  copyLabel,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onCopy: (v: string) => void;
  copyLabel: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={id}
          autoComplete="off"
          spellCheck={false}
          readOnly
          value={value}
          className={mono ? "min-w-0 font-mono text-xs" : "min-w-0 text-xs"}
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onCopy(value)}
          title={copyLabel}
          aria-label={`${copyLabel}: ${label}`}
        >
          <Copy aria-hidden="true" className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
