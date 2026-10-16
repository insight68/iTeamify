"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ChevronDown,
  Copy,
  Hash,
  Link2,
  LoaderCircle,
  LogOut,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@iteamify/core/api";
import { useAuthStore } from "@iteamify/core/auth";
import { issueKeys } from "@iteamify/core/issues/queries";
import { resolvePostAuthDestination, useCurrentWorkspace, useHasOnboarded } from "@iteamify/core/paths";
import { setCurrentWorkspace } from "@iteamify/core/platform";
import type { Workspace } from "@iteamify/core/types";
import { useDeleteWorkspace, useLeaveWorkspace } from "@iteamify/core/workspace/mutations";
import {
  memberListOptions,
  workspaceKeys,
  workspaceListOptions,
} from "@iteamify/core/workspace/queries";
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
import { Button } from "@iteamify/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@iteamify/ui/components/ui/collapsible";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@iteamify/ui/components/ui/sheet";
import { cn } from "@iteamify/ui/lib/utils";
import { copyText } from "@iteamify/ui/lib/clipboard";
import { AvatarUploadControl } from "../../common/avatar-upload-control";
import { useT } from "../../i18n";
import { useNavigation } from "../../navigation";
import { DeleteWorkspaceDialog } from "../../settings/components/delete-workspace-dialog";

type ConfirmAction = {
  title: string;
  description: string;
  variant?: "destructive";
  onConfirm: () => Promise<void>;
};

function ManagementSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-brand shadow-sm">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="rounded-2xl border bg-background/55 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  const { t } = useT("settings");
  if (status === "idle") return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}>
      {status === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
      {status === "saved" ? <Check className="size-3.5 text-success" /> : null}
      {status === "saving"
        ? t(($) => $.auto_save.saving)
        : status === "saved"
          ? t(($) => $.auto_save.saved)
          : t(($) => $.auto_save.failed)}
    </span>
  );
}

export function CompanyManagementSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("settings");
  const user = useAuthStore((state) => state.user);
  const workspace = useCurrentWorkspace();
  const workspaceID = workspace?.id ?? "";
  const { data: members = [], isFetched: membersFetched } = useQuery({
    ...memberListOptions(workspaceID),
    enabled: Boolean(workspaceID),
  });
  const queryClient = useQueryClient();
  const leaveWorkspace = useLeaveWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const navigation = useNavigation();
  const hasOnboarded = useHasOnboarded();
  const [name, setName] = useState(workspace?.name ?? "");
  const [issuePrefix, setIssuePrefix] = useState(workspace?.issue_prefix ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [prefixStatus, setPrefixStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [actionID, setActionID] = useState<string | null>(null);

  const currentMember = members.find((member) => member.user_id === user?.id) ?? null;
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";
  const isOwner = currentMember?.role === "owner";
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const isSoleOwner = isOwner && ownerCount <= 1;
  const isSoleMember = members.length <= 1;

  useEffect(() => {
    setName(workspace?.name ?? "");
    setIssuePrefix(workspace?.issue_prefix ?? "");
    setNameStatus("idle");
    setPrefixStatus("idle");
  }, [workspace?.id, workspace?.name, workspace?.issue_prefix]);

  const updateWorkspaceCache = (updated: Workspace) => {
    queryClient.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
      old?.map((item) => (item.id === updated.id ? updated : item)),
    );
  };

  const saveName = async () => {
    if (!workspace || !canManage) return;
    const nextName = name.trim();
    if (!nextName || nextName === workspace.name) return;
    setNameStatus("saving");
    try {
      const updated = await api.updateWorkspace(workspace.id, { name: nextName });
      updateWorkspaceCache(updated);
      setName(updated.name);
      setNameStatus("saved");
      toast.success(t(($) => $.workspace.toast_saved), { id: "company-management-save" });
    } catch (error) {
      setNameStatus("error");
      toast.error(error instanceof Error ? error.message : t(($) => $.workspace.toast_save_failed));
    }
  };

  const normalizePrefix = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const normalizedPrefix = normalizePrefix(issuePrefix);
  const prefixInvalid = normalizedPrefix.length === 0;
  const prefixChanged = Boolean(workspace && normalizedPrefix !== workspace.issue_prefix);

  const savePrefix = async (nextPrefix: string) => {
    if (!workspace) return;
    setPrefixStatus("saving");
    try {
      const updated = await api.updateWorkspace(workspace.id, { issue_prefix: nextPrefix });
      updateWorkspaceCache(updated);
      await queryClient.invalidateQueries({ queryKey: issueKeys.all(updated.id) });
      setIssuePrefix(updated.issue_prefix);
      setPrefixStatus("saved");
      toast.success(t(($) => $.workspace.toast_saved), { id: "company-management-save" });
    } catch (error) {
      setPrefixStatus("error");
      toast.error(error instanceof Error ? error.message : t(($) => $.workspace.toast_save_failed));
    }
  };

  const handlePrefixBlur = () => {
    if (!workspace || !canManage || prefixInvalid || !prefixChanged) return;
    const nextPrefix = normalizedPrefix;
    setConfirmAction({
      title: t(($) => $.workspace.prefix_confirm_title),
      description: t(($) => $.workspace.prefix_confirm_description, {
        oldPrefix: workspace.issue_prefix,
        newPrefix: nextPrefix,
      }),
      variant: "destructive",
      onConfirm: () => savePrefix(nextPrefix),
    });
  };

  const navigateAway = () => {
    if (!workspace) return;
    const cached = queryClient.getQueryData<Workspace[]>(workspaceListOptions().queryKey) ?? [];
    const remaining = cached.filter((item) => item.id !== workspace.id);
    setCurrentWorkspace(null, null);
    navigation.push(resolvePostAuthDestination(remaining, hasOnboarded));
  };

  const handleLeave = () => {
    if (!workspace) return;
    setConfirmAction({
      title: t(($) => $.workspace.leave_confirm_title),
      description: t(($) => $.workspace.leave_confirm_description, { name: workspace.name }),
      variant: "destructive",
      onConfirm: async () => {
        setActionID("leave");
        navigateAway();
        try {
          await leaveWorkspace.mutateAsync(workspace.id);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t(($) => $.workspace.toast_leave_failed));
        } finally {
          setActionID(null);
        }
      },
    });
  };

  const handleDelete = async () => {
    if (!workspace) return;
    setActionID("delete");
    try {
      await deleteWorkspace.mutateAsync(workspace.id);
      setDeleteDialogOpen(false);
      navigateAway();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(($) => $.workspace.toast_delete_failed));
    } finally {
      setActionID(null);
    }
  };

  if (!workspace) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-[540px]">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>{t(($) => $.workspace.management_title)}</SheetTitle>
            <SheetDescription>{t(($) => $.workspace.management_description)}</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-6">
            <ManagementSection
              icon={Building2}
              title={t(($) => $.workspace.section_general)}
              description={t(($) => $.workspace.identity_description)}
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <AvatarUploadControl
                  variant="workspace"
                  value={workspace.avatar_url ?? null}
                  name={workspace.name}
                  size={72}
                  disabled={!canManage}
                  ariaLabel={t(($) => $.workspace.change_logo_aria)}
                  onUploaded={async (url) => {
                    try {
                      const updated = await api.updateWorkspace(workspace.id, { avatar_url: url });
                      updateWorkspaceCache(updated);
                      toast.success(t(($) => $.workspace.toast_logo_updated), { id: "company-management-save" });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t(($) => $.workspace.toast_logo_failed));
                    }
                  }}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="company-management-name">{t(($) => $.workspace.name_label)}</Label>
                    <SaveIndicator status={nameStatus} />
                  </div>
                  <Input
                    id="company-management-name"
                    name="company-name"
                    autoComplete="organization"
                    value={name}
                    disabled={!canManage}
                    aria-invalid={!name.trim()}
                    onChange={(event) => {
                      setNameStatus("idle");
                      setName(event.target.value);
                    }}
                    onBlur={() => void saveName()}
                  />
                </div>
              </div>
              {!canManage ? <p className="mt-4 text-xs text-muted-foreground">{t(($) => $.workspace.manage_hint)}</p> : null}
            </ManagementSection>

            <ManagementSection
              icon={Hash}
              title={t(($) => $.workspace.system_identifiers_title)}
              description={t(($) => $.workspace.system_identifiers_description)}
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="company-management-slug">{t(($) => $.workspace.slug_label)}</Label>
                  <div className="flex gap-2">
                    <Input id="company-management-slug" value={workspace.slug} readOnly className="bg-muted/50 font-mono text-muted-foreground" />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={t(($) => $.workspace.copy_slug)}
                      onClick={() => {
                        void copyText(workspace.slug).then((copied) => {
                          if (copied) toast.success(t(($) => $.workspace.slug_copied));
                          else toast.error(t(($) => $.workspace.slug_copy_failed));
                        });
                      }}
                    >
                      <Copy />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="company-management-prefix">{t(($) => $.workspace.issue_prefix_label)}</Label>
                    <SaveIndicator status={prefixStatus} />
                  </div>
                  <Input
                    id="company-management-prefix"
                    value={issuePrefix}
                    disabled={!canManage}
                    maxLength={10}
                    aria-invalid={prefixInvalid}
                    className="max-w-40 font-mono uppercase"
                    onChange={(event) => {
                      setPrefixStatus("idle");
                      setIssuePrefix(normalizePrefix(event.target.value));
                    }}
                    onBlur={handlePrefixBlur}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t(($) => $.workspace.issue_prefix_hint, { example: `${normalizedPrefix || workspace.issue_prefix}-123` })}
                  </p>
                </div>
              </div>
            </ManagementSection>

            {membersFetched ? (
              <Collapsible open={dangerOpen} onOpenChange={setDangerOpen} className="rounded-2xl border border-destructive/20 bg-destructive/[0.025]">
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
                  <span className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg border border-destructive/20 bg-background text-destructive"><ShieldAlert className="size-4" /></span>
                    <span><span className="block font-medium">{t(($) => $.workspace.danger_zone)}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t(($) => $.workspace.danger_description)}</span></span>
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition group-data-[panel-open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-destructive/15 px-4 py-5 sm:px-5">
                  <div className="space-y-5">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div><p className="font-medium">{t(($) => $.workspace.leave_title)}</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{isSoleOwner ? (isSoleMember ? t(($) => $.workspace.leave_sole_member) : t(($) => $.workspace.leave_sole_owner)) : t(($) => $.workspace.leave_default)}</p></div>
                      <Button type="button" variant="outline" size="sm" onClick={handleLeave} disabled={actionID === "leave" || isSoleOwner}><LogOut />{actionID === "leave" ? t(($) => $.workspace.leaving) : t(($) => $.workspace.leave_button)}</Button>
                    </div>
                    {isOwner ? (
                      <div className="flex flex-col justify-between gap-3 border-t border-destructive/15 pt-5 sm:flex-row sm:items-center">
                        <div><p className="font-medium text-destructive">{t(($) => $.workspace.delete_title)}</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{t(($) => $.workspace.delete_description)}</p></div>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={actionID === "delete"}><Trash2 />{actionID === "delete" ? t(($) => $.workspace.deleting) : t(($) => $.workspace.delete_button)}</Button>
                      </div>
                    ) : null}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="flex items-start gap-2 rounded-xl bg-muted/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <Link2 className="mt-0.5 size-3.5 shrink-0" />
              {t(($) => $.workspace.management_footer)}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(nextOpen) => { if (!nextOpen) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.workspace.confirm_cancel)}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmAction?.variant === "destructive" ? "destructive" : "default"}
              onClick={async () => {
                await confirmAction?.onConfirm();
                setConfirmAction(null);
              }}
            >
              {t(($) => $.workspace.confirm_action)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteWorkspaceDialog
        workspaceName={workspace.name}
        loading={actionID === "delete"}
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (actionID === "delete" && !nextOpen) return;
          setDeleteDialogOpen(nextOpen);
        }}
        onConfirm={handleDelete}
      />
    </>
  );
}
