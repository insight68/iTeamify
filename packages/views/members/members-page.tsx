"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Plus, Search, Mail } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@iteamify/core/paths";
import { useCurrentMember } from "@iteamify/core/permissions";
import { memberListOptions, invitationListOptions } from "@iteamify/core/workspace/queries";
import { useInviteMember, useRevokeMemberInvitation } from "@iteamify/core/workspace/mutations";
import type { MemberRole } from "@iteamify/core/types";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Badge } from "@iteamify/ui/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@iteamify/ui/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@iteamify/ui/components/ui/alert-dialog";
import { ListGrid, ListGridBody, ListGridHeader, ListGridHeaderCell, ListGridRow, ListGridCell } from "@iteamify/ui/components/ui/list-grid";
import { CollectionPageHeader, CollectionPageHeaderAction, CollectionPageState } from "../layout/collection-page";
import { ActorAvatar } from "../common/actor-avatar";
import { AppLink } from "../navigation";
import { useT, useDateTime } from "../i18n";
import { MemberActions } from "./member-actions";

export function MembersPage() {
  const { t } = useT("members");
  const { t: ts } = useT("settings");
  const formatDate = useDateTime();
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();
  const current = useCurrentMember(wsId);
  const canManage = current.role === "owner" || current.role === "admin";
  const members = useQuery(memberListOptions(wsId));
  const invitations = useQuery({ ...invitationListOptions(wsId), enabled: canManage });
  const revoke = useRevokeMemberInvitation(wsId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState("members");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("created");
  const [revoking, setRevoking] = useState<{ id: string; email: string } | null>(null);
  const allMembers = members.data ?? [];
  const ownerCount = allMembers.filter((entry) => entry.role === "owner").length;
  const term = search.trim().toLocaleLowerCase();
  const rows = allMembers.filter((entry) => (!term || `${entry.name} ${entry.email}`.toLocaleLowerCase().includes(term)) && (role === "all" || entry.role === role))
    .sort((a, b) => sort === "name" ? (a.name || a.email).localeCompare(b.name || b.email) : a.created_at.localeCompare(b.created_at));
  const pending = (invitations.data ?? []).filter((entry) => entry.status === "pending" && (!term || entry.invitee_email.toLocaleLowerCase().includes(term)));
  const showInvitations = canManage && tab === "invitations";
  const query = showInvitations ? invitations : members;

  const revokeInvitation = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.id);
      setRevoking(null);
      toast.success(ts(($) => $.members.toast_invitation_revoked));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ts(($) => $.members.toast_invitation_revoke_failed));
    }
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    <CollectionPageHeader icon={Users} title={t(($) => $.list.title)} count={allMembers.length} actions={canManage && <CollectionPageHeaderAction icon={Plus} label={ts(($) => $.members.invite_button)} onClick={() => setInviteOpen(true)} />} />
    <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
      <div className="flex gap-1"><Button variant={!showInvitations ? "secondary" : "ghost"} size="sm" aria-pressed={!showInvitations} onClick={() => setTab("members")}>{t(($) => $.list.title)}</Button>{canManage && <Button variant={showInvitations ? "secondary" : "ghost"} size="sm" aria-pressed={showInvitations} onClick={() => setTab("invitations")}>{t(($) => $.list.invitations)}</Button>}</div>
      <div className="relative min-w-40 flex-1 sm:max-w-xs"><Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" aria-label={t(($) => $.list.search)} placeholder={t(($) => $.list.search)} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {!showInvitations && <><select aria-label={t(($) => $.list.role)} className="h-9 rounded-md border bg-background px-2 text-sm" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">{t(($) => $.list.all_roles)}</option>{(["owner", "admin", "member"] as const).map((value) => <option key={value} value={value}>{t(($) => $.role[value])}</option>)}</select><select aria-label={t(($) => $.list.sort)} className="h-9 rounded-md border bg-background px-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}><option value="created">{t(($) => $.list.joined)}</option><option value="name">{t(($) => $.list.name)}</option></select></>}
    </div>
    {query.isPending ? <CollectionPageState icon={Users} title={t(($) => $.list.loading)} role="status" /> : query.isError ? <CollectionPageState icon={Users} title={t(($) => $.list.load_failed)} role="alert" actions={<Button variant="outline" onClick={() => void query.refetch()}>{t(($) => $.list.retry)}</Button>} /> : <div className="@container min-h-0 flex-1 overflow-auto p-3 sm:p-5">
      {showInvitations ? pending.length === 0 ? <CollectionPageState icon={Mail} title={t(($) => $.list.no_invitations)} /> : <ul className="divide-y rounded-lg border">{pending.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-3 p-4"><Mail className="size-5 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{entry.invitee_email}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.created_at)}</p></div><Badge variant="outline">{t(($) => $.role[entry.role])}</Badge><Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => setRevoking({ id: entry.id, email: entry.invitee_email })}>{ts(($) => $.members.revoke_invitation_tooltip)}</Button></li>)}</ul> : rows.length === 0 ? <CollectionPageState icon={Search} title={t(($) => $.list.no_matches)} /> : <ListGrid aria-label={t(($) => $.list.title)} className="grid-cols-[8px_minmax(0,1fr)_80px_28px_8px] @2xl:min-w-[738px] @2xl:grid-cols-[12px_minmax(200px,1fr)_minmax(180px,1fr)_100px_130px_32px_12px]">
        <ListGridHeader><ListGridHeaderCell>{t(($) => $.list.name)}</ListGridHeaderCell><ListGridHeaderCell className="hidden @2xl:flex">{t(($) => $.list.email)}</ListGridHeaderCell><ListGridHeaderCell>{t(($) => $.list.role)}</ListGridHeaderCell><ListGridHeaderCell className="hidden @2xl:flex">{t(($) => $.list.joined)}</ListGridHeaderCell><ListGridHeaderCell /></ListGridHeader>
        <ListGridBody>{rows.map((member) => <ListGridRow key={member.id} className="min-h-16"><ListGridCell className="gap-3"><AppLink href={paths.memberDetail(member.user_id)} aria-label={t(($) => $.detail.open, { name: member.name || member.email })} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ActorAvatar actorType="member" actorId={member.user_id} size="lg" profileLink={false} /></AppLink><div className="min-w-0"><AppLink href={paths.memberDetail(member.user_id)} className="block truncate text-sm font-medium hover:underline">{member.name || member.email}</AppLink>{member.profile_description && <p className="truncate text-xs text-muted-foreground" title={member.profile_description}>{member.profile_description}</p>}</div></ListGridCell><ListGridCell className="hidden truncate text-sm text-muted-foreground @2xl:flex">{member.email}</ListGridCell><ListGridCell><Badge variant="secondary">{t(($) => $.role[member.role])}</Badge></ListGridCell><ListGridCell className="hidden text-xs text-muted-foreground @2xl:flex">{formatDate(member.created_at)}</ListGridCell><ListGridCell><MemberActions member={member} wsId={wsId} ownerCount={ownerCount} workspaceName={workspace?.name ?? ""} /></ListGridCell></ListGridRow>)}</ListGridBody>
      </ListGrid>}
    </div>}
    {inviteOpen && canManage && <InviteMemberDialog wsId={wsId} onClose={() => setInviteOpen(false)} />}
    <AlertDialog open={!!revoking} onOpenChange={(open) => { if (!open && !revoke.isPending) setRevoking(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ts(($) => $.members.revoke_invitation_title)}</AlertDialogTitle><AlertDialogDescription>{ts(($) => $.members.revoke_invitation_description, { email: revoking?.email ?? "" })}</AlertDialogDescription></AlertDialogHeader>{revoke.isError && <p role="alert" className="text-sm text-destructive">{ts(($) => $.members.toast_invitation_revoke_failed)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={revoke.isPending}>{ts(($) => $.members.confirm_cancel)}</AlertDialogCancel><Button variant="destructive" disabled={revoke.isPending} onClick={() => void revokeInvitation()}>{ts(($) => $.members.confirm_action)}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function InviteMemberDialog({ wsId, onClose }: { wsId: string; onClose: () => void }) {
  const { t } = useT("settings");
  const invite = useInviteMember(wsId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast.success(t(($) => $.members.toast_invitation_sent));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.members.toast_invitation_failed));
    }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !invite.isPending) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{t(($) => $.members.invite_title)}</DialogTitle><DialogDescription>{t(($) => $.members.roles[role].description)}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => void submit(event)}><Input aria-label={t(($) => $.members.invite_email_placeholder)} placeholder={t(($) => $.members.invite_email_placeholder)} type="email" autoComplete="email" required value={email} disabled={invite.isPending} onChange={(event) => setEmail(event.target.value)} /><select aria-label={t(($) => $.members.change_role)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={role} disabled={invite.isPending} onChange={(event) => setRole(event.target.value as MemberRole)}>{(["member", "admin"] as const).map((value) => <option key={value} value={value}>{t(($) => $.members.roles[value].label)}</option>)}</select>{invite.isError && <p role="alert" className="text-sm text-destructive">{t(($) => $.members.toast_invitation_failed)}</p>}<Button type="submit" disabled={!email.trim() || invite.isPending}>{invite.isPending ? t(($) => $.members.inviting) : t(($) => $.members.invite_button)}</Button></form></DialogContent></Dialog>;
}
