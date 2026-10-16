"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, MessageSquare, Plus } from "lucide-react";
import { useAuthStore } from "@iteamify/core/auth";
import { useCurrentMember } from "@iteamify/core/permissions";
import { applicationsOptions, useSaveApplication, useDeleteApplication, type SessionApplication } from "@iteamify/core/session-containers";
import { useWorkspacePaths } from "@iteamify/core/paths";
import { Button, buttonVariants } from "@iteamify/ui/components/ui/button";
import { Badge } from "@iteamify/ui/components/ui/badge";
import { AppLink, useNavigation } from "../navigation";
import { ApplicationEditor } from "../applications/applications-page";
import { useT } from "../i18n";

export function MemberApplicationsPanel({ wsId, userId, name }: { wsId: string; userId: string; name: string }) {
  const { t } = useT("chat");
  const { t: tm } = useT("members");
  const viewerId = useAuthStore((state) => state.user?.id ?? "");
  const current = useCurrentMember(wsId);
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  // The catalog includes managers' configurations and the viewer's own drafts.
  // Target discovery is contact-only and deliberately rejects self-contact.
  const query = useQuery(applicationsOptions(wsId, viewerId));
  const configurations = (query.data?.configurations ?? []).filter((row) => row.target_kind === "member" && row.target_id === userId && row.type === "contract_review");
  const providers = (query.data?.providers ?? []).filter((row) => row.target_kind === "member" && row.target_id === userId && row.type === "contract_review");
  const rows = [...configurations, ...providers.filter((row) => !configurations.some((entry) => entry.id === row.id))];
  const canManage = !query.isError && query.data?.can_manage === true && (current.role === "owner" || current.role === "admin");
  const save = useSaveApplication(wsId);
  const remove = useDeleteApplication(wsId);
  const [editing, setEditing] = useState<SessionApplication | null | undefined>();
  const busy = save.isPending || remove.isPending;
  const contactHref = `${paths.chat()}?member=${encodeURIComponent(userId)}&view=list`;
  const stateLabel = (status: string) => {
    switch (status) {
      case "enabled": return t(($) => $.applications.enabled);
      case "paused": return t(($) => $.applications.paused);
      case "draft": return t(($) => $.applications.draft);
      default: return tm(($) => $.detail.unknown_status);
    }
  };

  return <section className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{tm(($) => $.detail.applications)}</h2><p className="mt-1 text-sm text-muted-foreground">{tm(($) => $.detail.applications_description)}</p></div>{canManage && query.isSuccess && rows.length === 0 && <Button size="sm" variant="outline" onClick={() => setEditing(null)}><Plus className="size-4" />{t(($) => $.applications.add)}</Button>}</div>
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <MessageSquare className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{t(($) => $.containers.conversation)}</h3>
            <Badge variant="secondary">{t(($) => $.applications.system_default)}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(($) => $.applications.conversation_description)}</p>
          {viewerId !== userId && <AppLink className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })} href={contactHref}>{tm(($) => $.detail.message)}</AppLink>}
        </div>
      </div>
    </div>
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">{t(($) => $.applications.loading)}</p> : query.isError ? <div role="alert" className="space-y-3 text-sm"><p>{t(($) => $.applications.retry_load)}</p><Button variant="outline" onClick={() => void query.refetch()}>{tm(($) => $.list.retry)}</Button></div> : rows.length === 0 ? <div className="rounded-lg border border-dashed px-5 py-10 text-center"><FileText className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">{tm(($) => $.detail.no_applications)}</p><p className="mt-2 text-sm text-muted-foreground">{tm(($) => $.detail.no_applications_hint)}</p></div> : rows.map((row) => <article key={row.id} className="space-y-4 rounded-lg border p-4 sm:p-5">
      <div className="flex items-start gap-3"><FileText className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{row.config.service_name}</h3><p className="mt-1 text-xs text-muted-foreground">{t(($) => $.containers.contract_review)}</p></div><Badge variant="outline">{stateLabel(row.status)}</Badge></div>
      {row.config.description && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{row.config.description}</p>}
      {row.config.contract_types.length > 0 && <div className="flex flex-wrap gap-2">{row.config.contract_types.map((type) => <Badge key={type} variant="secondary">{type}</Badge>)}</div>}
      {configurations.some((entry) => entry.id === row.id) && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t(($) => $.applications.rules)}</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{[row.config.review_instructions, row.config.result_requirements].filter(Boolean).join("\n\n") || "—"}</p></details>}
      <div className="flex flex-wrap gap-2">
        {viewerId !== userId && row.status === "enabled" && row.available === true && <Button size="sm" variant="outline" onClick={() => navigation.push(`${paths.chat()}?member=${encodeURIComponent(userId)}&new=${crypto.randomUUID()}&container=contract_review`)}>{t(($) => $.applications.new_contract)}</Button>}
        {canManage && <><Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(row)}>{t(($) => $.applications.edit)}</Button>{(row.status === "enabled" || row.status === "paused") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => save.mutate({ id: row.id, input: { target_kind: "member", target_id: userId, version: row.version, config: row.config, status: row.status === "enabled" ? "paused" : "enabled" } })}>{row.status === "enabled" ? t(($) => $.applications.pause) : t(($) => $.applications.enable)}</Button>}{row.status === "draft" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove.mutate(row)}>{t(($) => $.applications.delete_draft)}</Button>}</>}
      </div>
    </article>)}
    {(save.isError || remove.isError) && <p role="alert" className="text-sm text-destructive">{t(($) => $.applications.save_failed)}</p>}
    {canManage && editing !== undefined && <ApplicationEditor key={editing?.id ?? "new"} application={editing} configurations={configurations} fixedTarget={{ kind: "member", id: userId, name }} onClose={() => setEditing(undefined)} />}
  </section>;
}
