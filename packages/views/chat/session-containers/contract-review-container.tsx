"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, MessageSquare, ArrowLeft, Loader2 } from "lucide-react";
import { ApiError } from "@iteamify/core/api";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useAuthStore } from "@iteamify/core/auth";
import {
  contractReviewOptions, useCreateContractReview, useContractReviewAction, useReadContractReview, useDownloadContractFile,
  useContractDraftStore, setContractDraft, removeContractDraft, EMPTY_CONTRACT_FIELDS, type ContractFields, type ContractActionInput, type ContractReview,
  applicationsOptions, type ApplicationConfig,
  type CreateContractReviewInput,
} from "@iteamify/core/session-containers";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@iteamify/ui/components/ui/select";
import { useT, useDateTime } from "../../i18n";
import { useAppForeground } from "../../common/use-app-foreground";
import type { ContainerTarget } from "./container-host";

export function ContractReviewContainer({ target, sessionId, creating, onCreated, conversation }: { target: ContainerTarget; sessionId: string; creating: boolean; onCreated: (id: string) => void; conversation: () => ReactNode }) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const foreground = useAppForeground();
  const [discussion, setDiscussion] = useState(false);
  const query = useQuery({ ...contractReviewOptions(wsId, userId, sessionId), enabled: !creating });
  const { mutate: markRead } = useReadContractReview(wsId, sessionId);
  const readAttempt = useRef(0);
  useEffect(() => {
    const review = query.data;
    if (discussion || !foreground || !review?.has_unread || readAttempt.current >= review.version) return;
    const timer = setTimeout(() => { readAttempt.current = review.version; markRead(review.version, { onError: () => { readAttempt.current = 0; } }); }, 0);
    return () => clearTimeout(timer);
  }, [discussion, foreground, query.data, markRead]);
  if (discussion) return <div className="flex min-h-0 flex-1 flex-col"><div className="flex shrink-0 items-center border-b px-4 py-2"><Button variant="ghost" size="sm" onClick={() => setDiscussion(false)}><ArrowLeft className="size-4" />{t(($) => $.containers.back_to_request)}</Button></div>{conversation()}</div>;
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex min-h-12 shrink-0 items-center gap-3 border-b pl-12 pr-4">
      <FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{t(($) => $.containers.contract_review)} · {target.name}</span>
      {!creating && <Button variant="ghost" size="sm" onClick={() => setDiscussion(true)}><MessageSquare className="size-4" />{t(($) => $.containers.discussion)}</Button>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl">
        {creating ? <ContractSubmission target={target} sessionId={sessionId} onCreated={onCreated} /> : query.isPending ? <p className="text-sm text-muted-foreground">{t(($) => $.containers.loading)}</p> : query.isError ? <div role="alert"><p className="text-sm text-destructive">{t(($) => $.containers.load_failed)}</p><Button variant="ghost" onClick={() => void query.refetch()}>{t(($) => $.direct.retry)}</Button></div> : query.data ? <ContractDetail key={sessionId} review={query.data} /> : null}
      </div>
    </div>
  </div>;
}

function ContractSubmission({ target, sessionId, onCreated }: { target: ContainerTarget; sessionId: string; onCreated: (id: string) => void }) {
  const { t } = useT("chat");
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const applications = useQuery(applicationsOptions(wsId, userId, { kind: target.kind === "direct" ? "member" : "agent", id: target.id }));
  const application = applications.data?.providers?.find((p) => p.type === "contract_review");
  const prefix = `${wsId}:${userId}:${target.kind}:${target.id}:`;
  const existingKey = useContractDraftStore((s) => Object.keys(s.draft.fields).find((k) => k.startsWith(prefix) && k.endsWith(`:${sessionId}`)));
  const key = existingKey ?? `${prefix}${application?.id ?? "unavailable"}:${sessionId}`;
  const stored = useContractDraftStore((s) => s.draft.fields[key]);
  const fields = stored ?? { ...EMPTY_CONTRACT_FIELDS, priority: application?.config.default_priority ?? "normal" };
  const [files, setFiles] = useState<File[]>([]);
  const submit = useCreateContractReview(wsId);
  const attempted = useRef<{ input: CreateContractReviewInput; files: File[] } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const send = (submission: { input: CreateContractReviewInput; files: File[] }) => submit.mutate(submission, {
    onSuccess: (result) => { attempted.current = null; removeContractDraft(key); if (mounted.current) onCreated(result.session_id); },
    onError: (error) => { if (error instanceof ApiError && [400, 403, 409, 426].includes(error.status)) { attempted.current = null; void applications.refetch(); } },
  });
  return <form onSubmit={(e) => {
    e.preventDefault();
    if (submit.isPending || !fields.title.trim() || !files.length || !application) return;
    attempted.current = { input: { session_id: sessionId, kind: target.kind, ...(target.kind === "agent" ? { agent_id: target.id } : { peer_user_id: target.id }), fields, application_id: application.id, application_version: application.version }, files };
    send(attempted.current);
  }} className="space-y-6">
    <div><h2 className="text-xl font-semibold tracking-tight">{t(($) => $.containers.submit_title)}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t(($) => $.containers.submit_description)}</p></div>
    <section className="rounded-lg border bg-muted/30 p-4 text-sm"><p className="font-medium">{application?.config.service_name ?? t(($) => $.containers.contract_review)} · {target.name}</p><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{application?.config.description}</p><p className="mt-2 text-muted-foreground">{target.kind === "agent" ? t(($) => $.applications.auto_process) : t(($) => $.applications.human_process)}</p></section>
    {applications.isError && <p role="alert" className="text-sm text-destructive">{t(($) => $.applications.retry_load)} <Button variant="ghost" size="sm" onClick={() => void applications.refetch()}>{t(($) => $.direct.retry)}</Button></p>}
    {applications.isSuccess && !application && <p role="alert" className="text-sm text-destructive">{t(($) => $.applications.unavailable)}</p>}
    <fieldset disabled={submit.isPending || !application || (submit.isError && attempted.current !== null)} className="space-y-5 disabled:opacity-70"><ContractFieldEditor fields={fields} rules={application?.config} onChange={(next) => setContractDraft(key, next)} /><ContractFilePicker files={files} onChange={setFiles} required /></fieldset>
    {submit.isError && <div role="alert"><p className="text-sm text-destructive">{t(($) => $.containers.save_failed)}</p>{attempted.current && <Button type="button" variant="outline" className="mt-2" disabled={submit.isPending} onClick={() => { if (attempted.current) send(attempted.current); }}>{t(($) => $.direct.retry)}</Button>}</div>}
    <div className="flex justify-end border-t pt-4"><Button type="submit" disabled={submit.isPending || !application || !fields.title.trim() || files.length === 0}>{submit.isPending && <Loader2 className="size-4 animate-spin" />}{t(($) => $.containers.submit)}</Button></div>
  </form>;
}

function ContractFieldEditor({ fields, onChange, rules }: { fields: ContractFields; onChange: (fields: ContractFields) => void; rules?: ApplicationConfig | null }) {
  const { t } = useT("chat");
  const set = (key: keyof ContractFields, value: string) => onChange({ ...fields, [key]: value });
  const priority = [{ value: "normal", label: t(($) => $.containers.priority_normal) }, { value: "high", label: t(($) => $.containers.priority_high) }, { value: "urgent", label: t(($) => $.containers.priority_urgent) }];
  const stages = [{ value: "", label: t(($) => $.containers.stage_unknown) }, ...(["contacted", "qualified", "proposal", "negotiating", "won", "lost"] as const).map((value) => ({ value, label: t(($) => $.containers.stages[value]) }))];
  return <>
    <div className="space-y-2"><Label htmlFor="contract-title">{t(($) => $.containers.title)}</Label><Input id="contract-title" value={fields.title} maxLength={200} required onChange={(e) => set("title", e.target.value)} /></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="contract-type">{t(($) => $.containers.contract_type)}</Label>{rules?.contract_types.length ? <select id="contract-type" className="h-9 w-full rounded-md border bg-background px-3 text-sm" required value={fields.contract_type} onChange={(e) => set("contract_type", e.target.value)}><option value="">—</option>{rules.contract_types.map((type) => <option key={type}>{type}</option>)}</select> : <Input id="contract-type" value={fields.contract_type} maxLength={100} onChange={(e) => set("contract_type", e.target.value)} />}</div>
      <div className="space-y-2"><Label htmlFor="contract-priority">{t(($) => $.containers.priority)}</Label><Select items={priority} value={fields.priority} onValueChange={(v) => { if (v) set("priority", v); }}><SelectTrigger id="contract-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{priority.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="contract-deadline">{t(($) => $.containers.deadline)}</Label><Input id="contract-deadline" type="date" value={fields.deadline} onChange={(e) => set("deadline", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="contract-stage">{t(($) => $.containers.opportunity_stage)}</Label><Select items={stages} value={fields.opportunity_stage} onValueChange={(v) => { if (v !== null) set("opportunity_stage", v); }}><SelectTrigger id="contract-stage" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{stages.map((item) => <SelectItem key={item.value || "unknown"} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="space-y-2"><Label htmlFor="contract-background">{t(($) => $.containers.background)}</Label>{rules?.require_background && <span aria-hidden="true"> *</span>}<Textarea id="contract-background" required={rules?.require_background === true} value={fields.background} maxLength={5000} onChange={(e) => set("background", e.target.value)} className="min-h-24" /></div>
    <div className="space-y-2"><Label htmlFor="contract-focus">{t(($) => $.containers.focus)}</Label>{rules?.require_focus && <span aria-hidden="true"> *</span>}<Textarea id="contract-focus" required={rules?.require_focus === true} value={fields.focus} maxLength={5000} onChange={(e) => set("focus", e.target.value)} className="min-h-24" /></div>
  </>;
}
function ContractFilePicker({ files, onChange, required = false }: { files: File[]; onChange: (files: File[]) => void; required?: boolean }) {
  const { t } = useT("chat");
  return <div className="space-y-2"><Label htmlFor="contract-files">{t(($) => $.containers.files)}</Label><Input id="contract-files" type="file" accept=".pdf,.doc,.docx,.txt" multiple required={required} onChange={(e) => onChange(Array.from(e.target.files ?? []))} /><p className="text-xs text-muted-foreground">{t(($) => $.containers.file_hint)}</p>{files.length > 0 && <ul className="space-y-1 text-sm">{files.map((file, i) => <li key={`${i}:${file.name}`} className="break-all">{file.name}</li>)}</ul>}</div>;
}

function ContractDetail({ review }: { review: ContractReview }) {
  const { t } = useT("chat");
  const formatDate = useDateTime();
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const requester = userId === review.creator_id;
  const update = useContractReviewAction(wsId, review.id);
  const download = useDownloadContractFile(wsId);
  const [fields, setFields] = useState(review.fields);
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const retryInput = useRef<{ input: ContractActionInput; files: File[] } | null>(null);
  const action = (name: string) => {
    const input: ContractActionInput = { request_key: crypto.randomUUID(), version: review.version, action: name, note, result, ...(name === "supplement" ? { fields } : {}) };
    retryInput.current = { input, files };
    update.mutate(retryInput.current, { onSuccess: () => { setNote(""); setFiles([]); setResult(""); retryInput.current = null; }, onError: (error) => { if (error instanceof ApiError && error.status === 409) retryInput.current = null; } });
  };
  const statusLabels: Record<string, string> = { submitted: t(($) => $.containers.statuses.submitted), accepted: t(($) => $.containers.statuses.accepted), needs_info: t(($) => $.containers.statuses.needs_info), in_review: t(($) => $.containers.statuses.in_review), completed: t(($) => $.containers.statuses.completed) };
  const actionLabels: Record<string, string> = { accept: t(($) => $.containers.accept), start: t(($) => $.containers.start), request_info: t(($) => $.containers.request_info), complete: t(($) => $.containers.complete), supplement: t(($) => $.containers.supplement) };
  const taskLabels: Record<string, string> = { queued: t(($) => $.applications.task_states.queued), dispatched: t(($) => $.applications.task_states.dispatched), running: t(($) => $.applications.task_states.running), failed: t(($) => $.applications.task_states.failed), cancelled: t(($) => $.applications.task_states.cancelled), completed: t(($) => $.applications.task_states.completed), deferred: t(($) => $.applications.task_states.deferred), waiting: t(($) => $.applications.task_states.waiting) };
  const humanProcessor = !requester && review.kind === "direct";
  return <div className="space-y-7">
    {review.task && <section className="rounded-lg border bg-muted/30 p-4 text-sm"><p>{t(($) => $.applications.task_status)}: {taskLabels[review.task.status] ?? review.task.status}</p>{review.task.error && <p className="mt-2 break-words text-destructive">{review.task.error}</p>}{requester && review.can_act && ["submitted", "accepted", "in_review"].includes(review.status) && ["failed", "cancelled", "completed"].includes(review.task.status) && <Button className="mt-3" size="sm" disabled={update.isPending} onClick={() => action("retry")}>{t(($) => $.applications.retry_processing)}</Button>}</section>}
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold tracking-tight">{review.fields.title}</h2><span className="rounded-md border bg-muted px-2.5 py-1 text-xs font-medium">{statusLabels[review.status] ?? review.status}</span></div>
    <dl className="grid gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-2">
      {[[t(($) => $.containers.contract_type), review.fields.contract_type], [t(($) => $.containers.priority), t(($) => $.containers[`priority_${review.fields.priority}`])], [t(($) => $.containers.deadline), review.fields.deadline], [t(($) => $.containers.opportunity_stage), review.fields.opportunity_stage ? t(($) => $.containers.stages[review.fields.opportunity_stage as keyof typeof $.containers.stages]) : t(($) => $.containers.stage_unknown)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value || "—"}</dd></div>)}
    </dl>
    {[[t(($) => $.containers.background), review.fields.background], [t(($) => $.containers.focus), review.fields.focus]].filter(([, value]) => !!value).map(([label, value]) => <section key={label}><h3 className="text-sm font-medium">{label}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{value}</p></section>)}
    <section><h3 className="text-sm font-medium">{t(($) => $.containers.files)}</h3><ul className="mt-3 space-y-2">{review.files.map((file) => <li key={file.id} className="flex items-center gap-3 rounded-lg border px-3 py-2"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm" title={file.filename}>{file.filename}</span><Button variant="ghost" size="icon-sm" disabled={download.isPending} aria-label={`${t(($) => $.containers.download)} ${file.filename}`} onClick={() => download.mutate(file.id, { onSuccess: (blob) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = file.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } })}><Download className="size-4" /></Button></li>)}</ul>{download.isError && <p role="alert" className="mt-2 text-sm text-destructive">{t(($) => $.containers.load_failed)}</p>}</section>
    {review.note && <section className="rounded-lg border-l-2 border-primary bg-muted/40 p-4"><h3 className="text-sm font-medium">{t(($) => $.containers.processor_note)}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{review.note}</p></section>}
    {review.result && <section className="rounded-lg border p-5"><h3 className="text-sm font-medium">{t(($) => $.containers.result)}</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{review.result}</p></section>}
    {review.can_act && review.status !== "completed" && <fieldset disabled={update.isPending} className="space-y-4 rounded-lg border p-5">
      {requester && review.status === "needs_info" && <><ContractFieldEditor fields={fields} rules={review.configuration} onChange={setFields} /><ContractFilePicker files={files} onChange={setFiles} /></>}
      {(humanProcessor || (requester && review.status === "needs_info")) && <div className="space-y-2"><Label htmlFor="contract-note">{t(($) => $.containers.note)}</Label><Textarea id="contract-note" value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} /></div>}
      {humanProcessor && review.status === "in_review" && <><Label htmlFor="contract-result">{t(($) => $.containers.result)}</Label><Textarea id="contract-result" value={result} maxLength={50000} onChange={(e) => setResult(e.target.value)} className="min-h-36" /><ContractFilePicker files={files} onChange={setFiles} /></>}
      <div className="flex flex-wrap justify-end gap-2">
        {humanProcessor && ["submitted", "accepted", "in_review"].includes(review.status) && <Button variant="outline" disabled={!note.trim()} onClick={() => action("request_info")}>{actionLabels.request_info}</Button>}
        {humanProcessor && review.status === "submitted" && <Button onClick={() => action("accept")}>{actionLabels.accept}</Button>}
        {humanProcessor && review.status === "accepted" && <Button onClick={() => action("start")}>{actionLabels.start}</Button>}
        {humanProcessor && review.status === "in_review" && <Button disabled={!result.trim()} onClick={() => action("complete")}>{actionLabels.complete}</Button>}
        {requester && review.status === "needs_info" && <Button onClick={() => action("supplement")}>{actionLabels.supplement}</Button>}
      </div>
      {review.kind === "agent" && requester && <p className="text-sm leading-6 text-muted-foreground">{review.configuration ? t(($) => $.containers.agent_hint) : t(($) => $.applications.legacy_agent_hint)}</p>}
      {update.isError && <div role="alert"><p className="text-sm text-destructive">{t(($) => $.containers.action_failed)}</p><Button variant="ghost" size="sm" onClick={() => { if (retryInput.current) update.mutate(retryInput.current, { onSuccess: () => { setNote(""); setFiles([]); setResult(""); retryInput.current = null; }, onError: (error) => { if (error instanceof ApiError && error.status === 409) retryInput.current = null; } }); else update.reset(); }}>{retryInput.current ? t(($) => $.direct.retry) : t(($) => $.containers.refresh_details)}</Button></div>}
    </fieldset>}
    {review.actions.length > 0 && <section><h3 className="text-sm font-medium">{t(($) => $.containers.activity)}</h3><ol className="mt-3 space-y-3 border-l pl-4">{review.actions.map((entry) => <li key={entry.version} className="text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{actionLabels[entry.action] ?? entry.action}</span><time className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</time></div>{entry.note && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{entry.note}</p>}</li>)}</ol></section>}
  </div>;
}
