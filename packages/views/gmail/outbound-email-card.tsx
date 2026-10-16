"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Paperclip, Send, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { emailDraftFromRecord, gmailConnectionsOptions, useSendEmail, useUpdateEmailDraft, type OutboundEmail, type EmailDraft } from "@iteamify/core/gmail";
import { Button } from "@iteamify/ui/components/ui/button";
import { Badge } from "@iteamify/ui/components/ui/badge";
import { Input } from "@iteamify/ui/components/ui/input";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { useT } from "../i18n";

export function OutboundEmailCard({ email, readOnly = false }: { email: OutboundEmail; readOnly?: boolean }) {
  const { t } = useT("connections");
  const [editing, setEditing] = useState(false);
  const send = useSendEmail(email.workspace_id);
  const isDraft = email.status === "draft";
  const busy = email.status === "queued" || email.status === "sending";
  const status = (() => {
    switch (email.status) {
      case "draft": return t(($) => $.outbound.draft);
      case "queued": return t(($) => $.outbound.queued);
      case "sending": return t(($) => $.outbound.sending);
      case "sent": return t(($) => $.outbound.sent);
      case "failed": return t(($) => $.outbound.failed);
      default: return t(($) => $.outbound.unknown);
    }
  })();
  async function handleSend() {
    if (send.isPending || !isDraft) return;
    try { await send.mutateAsync({ id: email.id, version: email.version }); }
    catch { toast.error(t(($) => $.outbound.send_failed)); }
  }
  return (
    <section aria-label={t(($) => $.outbound.title)} className="w-full max-w-2xl overflow-hidden rounded-xl border border-surface-border bg-surface text-sm shadow-[var(--surface-shadow)]">
      <div className="flex items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
        <span className="flex items-center gap-2 font-medium"><Mail className="size-4" aria-hidden="true" />{t(($) => $.outbound.title)}</span>
        <Badge variant="outline" aria-live="polite">{busy && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}{status}</Badge>
      </div>
      {editing && isDraft && !readOnly ? <EmailDraftEditor email={email} onClose={() => setEditing(false)} /> : <>
        <div className="space-y-3 px-4 py-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t(($) => $.outbound.from)}</dt><dd className="break-words">{email.from_address}</dd>
            <dt className="text-muted-foreground">{t(($) => $.outbound.to)}</dt><dd className="break-words">{email.to_addresses.join(", ")}</dd>
            {email.cc_addresses.length > 0 && <><dt className="text-muted-foreground">{t(($) => $.outbound.cc)}</dt><dd className="break-words">{email.cc_addresses.join(", ")}</dd></>}
            {email.bcc_addresses.length > 0 && <><dt className="text-muted-foreground">{t(($) => $.outbound.bcc)}</dt><dd className="break-words">{email.bcc_addresses.join(", ")}</dd></>}
          </dl>
          <h3 className="break-words font-semibold">{email.subject}</h3>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">{email.body}</div>
          {email.attachments.length > 0 && <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">{email.attachments.map((a) => <li key={a.id} className="flex items-center gap-2"><Paperclip className="size-3 shrink-0" aria-hidden="true" /><span className="break-all">{a.filename}</span><span className="shrink-0">{Math.ceil(a.size_bytes / 1024)} KB</span></li>)}</ul>}
          {email.status === "sent" && <p className="text-xs text-muted-foreground">{t(($) => $.outbound.sent_detail)}{email.sent_at && ` · ${new Date(email.sent_at).toLocaleString()}`}</p>}
          {email.status === "unknown" && <p role="status" className="text-xs leading-relaxed text-warning">{t(($) => $.outbound.unknown_detail)}</p>}
          {email.status === "failed" && <p role="status" className="text-xs leading-relaxed text-destructive">{email.error_code === "gmail_auth_expired" || email.error_code === "gmail_permission_denied" ? t(($) => $.outbound.auth_failed) : t(($) => $.outbound.failed_detail)}</p>}
          {email.status === "queued" && email.error_code === "gmail_rate_limited" && <p className="text-xs text-muted-foreground">{t(($) => $.outbound.rate_limited)}</p>}
        </div>
        {!readOnly && isDraft && <div className="flex flex-wrap items-center gap-2 border-t border-surface-border px-4 py-3">
          <Button size="sm" disabled={send.isPending} onClick={() => void handleSend()}>{send.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}{t(($) => $.outbound.send)}</Button>
          <Button size="sm" variant="ghost" disabled={send.isPending} onClick={() => setEditing(true)}><Pencil className="size-3.5" />{t(($) => $.outbound.edit)}</Button>
          <span className="text-xs text-muted-foreground">{t(($) => $.outbound.review_hint)}</span>
        </div>}
      </>}
    </section>
  );
}

function EmailDraftEditor({ email, onClose }: { email: OutboundEmail; onClose: () => void }) {
  const { t } = useT("connections");
  const [version] = useState(email.version);
  const [draft, setDraft] = useState<EmailDraft>(() => emailDraftFromRecord(email));
  const update = useUpdateEmailDraft(email.workspace_id);
  const { data } = useQuery(gmailConnectionsOptions(email.workspace_id));
  const changed = email.version !== version;
  const edit = <K extends keyof EmailDraft>(key: K, value: EmailDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  async function save() {
    if (update.isPending || changed) return;
    const cleaned = { ...draft, to_addresses: draft.to_addresses.filter((s) => s.trim()), cc_addresses: draft.cc_addresses.filter((s) => s.trim()), bcc_addresses: draft.bcc_addresses.filter((s) => s.trim()) };
    try { await update.mutateAsync({ id: email.id, version, draft: cleaned }); onClose(); }
    catch { toast.error(t(($) => $.outbound.save_failed)); }
  }
  return <form className="space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <label className="block space-y-1 text-xs"><span>{t(($) => $.outbound.from)}</span>
      <select value={draft.connection_id} onChange={(e) => edit("connection_id", e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
        <option value={email.connection_id}>{email.from_address}</option>
        {data?.connections.filter((a) => a.can_send && a.id !== email.connection_id).map((a) => <option key={a.id} value={a.id}>{a.email_address}</option>)}
      </select>
    </label>
    {(["to_addresses", "cc_addresses", "bcc_addresses"] as const).map((key) => <label key={key} className="block space-y-1 text-xs">
      <span>{key === "to_addresses" ? t(($) => $.outbound.to) : key === "cc_addresses" ? t(($) => $.outbound.cc) : t(($) => $.outbound.bcc)}</span>
      <Textarea rows={2} value={draft[key].join("\n")} onChange={(e) => edit(key, e.target.value.split("\n"))} />
    </label>)}
    <p className="text-xs text-muted-foreground">{t(($) => $.outbound.address_hint)}</p>
    <label className="block space-y-1 text-xs"><span>{t(($) => $.outbound.subject)}</span><Input required maxLength={500} value={draft.subject} onChange={(e) => edit("subject", e.target.value)} /></label>
    <label className="block space-y-1 text-xs"><span>{t(($) => $.outbound.body)}</span><Textarea required rows={9} value={draft.body} onChange={(e) => edit("body", e.target.value)} /></label>
    {email.attachments.filter((a) => draft.attachment_ids.includes(a.id)).map((a) => <div key={a.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{a.filename}</span><Button type="button" variant="ghost" size="icon-sm" aria-label={t(($) => $.outbound.remove_attachment, { name: a.filename })} onClick={() => edit("attachment_ids", draft.attachment_ids.filter((id) => id !== a.id))}><X className="size-3.5" /></Button></div>)}
    {changed && <p role="alert" className="text-xs text-warning">{t(($) => $.outbound.changed)}</p>}
    <div className="flex gap-2"><Button size="sm" type="submit" disabled={changed || update.isPending}>{t(($) => $.outbound.save)}</Button><Button size="sm" type="button" variant="ghost" onClick={onClose}>{t(($) => $.outbound.cancel)}</Button></div>
  </form>;
}
