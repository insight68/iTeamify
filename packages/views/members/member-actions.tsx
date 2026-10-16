"use client";

import { useState } from "react";
import { MoreHorizontal, Shield, UserMinus } from "lucide-react";
import { toast } from "sonner";
import type { MemberWithUser, MemberRole } from "@iteamify/core/types";
import { useCurrentMember } from "@iteamify/core/permissions";
import { canChangeMemberRole } from "@iteamify/core/permissions/rules";
import { useUpdateMemberRole, useRemoveMember } from "@iteamify/core/workspace/mutations";
import { Button } from "@iteamify/ui/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@iteamify/ui/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@iteamify/ui/components/ui/alert-dialog";
import { useT } from "../i18n";

export function MemberActions({ member, wsId, workspaceName, ownerCount, onRemoved }: {
  member: MemberWithUser; wsId: string; workspaceName: string; ownerCount: number; onRemoved?: () => void;
}) {
  const { t } = useT("settings");
  const { t: tm } = useT("members");
  const current = useCurrentMember(wsId);
  const update = useUpdateMemberRole(wsId);
  const remove = useRemoveMember(wsId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canManage = current.userId !== member.user_id && canChangeMemberRole(member, ownerCount, current).allowed;
  if (!canManage) return null;

  const roles: MemberRole[] = current.role === "owner" ? ["member", "admin", "owner"] : ["member", "admin"];
  const changeRole = async (role: MemberRole) => {
    try {
      await update.mutateAsync({ memberId: member.id, role });
      toast.success(t(($) => $.members.toast_role_updated));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.members.toast_role_failed));
    }
  };
  const removeMember = async () => {
    try {
      await remove.mutateAsync(member.id);
      setConfirmRemove(false);
      toast.success(t(($) => $.members.toast_member_removed));
      onRemoved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.members.toast_member_remove_failed));
    }
  };

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={update.isPending || remove.isPending} aria-label={tm(($) => $.detail.manage, { name: member.name || member.email })} />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Shield className="size-4" />{t(($) => $.members.change_role)}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {roles.map((role) => <DropdownMenuItem key={role} disabled={role === member.role} onClick={() => void changeRole(role)}>
              {t(($) => $.members.roles[role].label)}
            </DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setConfirmRemove(true)}><UserMinus className="size-4" />{t(($) => $.members.remove_action)}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={confirmRemove} onOpenChange={(open) => { if (!remove.isPending) setConfirmRemove(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(($) => $.members.remove_member_title, { name: member.name || member.email })}</AlertDialogTitle>
          <AlertDialogDescription>{t(($) => $.members.remove_member_description, { name: member.name || member.email, workspace: workspaceName })}</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && <p role="alert" className="text-sm text-destructive">{t(($) => $.members.toast_member_remove_failed)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>{t(($) => $.members.confirm_cancel)}</AlertDialogCancel>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => void removeMember()}>{t(($) => $.members.confirm_action)}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
