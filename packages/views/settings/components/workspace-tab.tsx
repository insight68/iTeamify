"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleUser,
  FolderKanban,
  Warehouse,
  Inbox,
  ListTodo,
  LogOut,
  Save,
  Search,
  SquarePen,
} from "lucide-react";
import { Input } from "@teamify/ui/components/ui/input";
import { Textarea } from "@teamify/ui/components/ui/textarea";
import { Label } from "@teamify/ui/components/ui/label";
import { Button } from "@teamify/ui/components/ui/button";
import { Card, CardContent } from "@teamify/ui/components/ui/card";
import { Switch } from "@teamify/ui/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@teamify/ui/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@teamify/core/auth";
import { useLeaveWorkspace, useDeleteWorkspace } from "@teamify/core/workspace/mutations";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  memberListOptions,
  workspaceKeys,
  workspaceListOptions,
} from "@teamify/core/workspace/queries";
import { api } from "@teamify/core/api";
import {
  resolvePostAuthDestination,
  useCurrentWorkspace,
  useHasOnboarded,
} from "@teamify/core/paths";
import { setCurrentWorkspace } from "@teamify/core/platform";
import {
  getWorkspaceModuleNavVisibility,
  type WorkspaceModuleKey,
  withWorkspaceModuleNavVisibilityMap,
} from "@teamify/core/workspace/modules";
import {
  getWorkspaceShortcutNavVisibility,
  type WorkspaceShortcutNavKey,
  withWorkspaceShortcutNavVisibilityMap,
} from "@teamify/core/workspace/navigation";
import type { Workspace } from "@teamify/core/types";
import { useNavigation } from "../../navigation";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { useT } from "../../i18n";

const moduleRows: {
  key: WorkspaceModuleKey;
  icon: typeof CheckCircle2;
  titleKey: "issues_nav_title" | "projects_nav_title" | "reconciliation_nav_title" | "inventory_nav_title";
  descriptionKey:
    | "issues_nav_description"
    | "projects_nav_description"
    | "reconciliation_nav_description"
    | "inventory_nav_description";
}[] = [
  {
    key: "issues",
    icon: ListTodo,
    titleKey: "issues_nav_title",
    descriptionKey: "issues_nav_description",
  },
  {
    key: "projects",
    icon: FolderKanban,
    titleKey: "projects_nav_title",
    descriptionKey: "projects_nav_description",
  },
  {
    key: "reconciliation",
    icon: CheckCircle2,
    titleKey: "reconciliation_nav_title",
    descriptionKey: "reconciliation_nav_description",
  },
  {
    key: "inventory",
    icon: Warehouse,
    titleKey: "inventory_nav_title",
    descriptionKey: "inventory_nav_description",
  },
];

const shortcutRows: {
  key: WorkspaceShortcutNavKey;
  icon: typeof CheckCircle2;
  titleKey:
    | "inbox_nav_title"
    | "my_issues_nav_title"
    | "create_issue_nav_title"
    | "search_nav_title";
  descriptionKey:
    | "inbox_nav_description"
    | "my_issues_nav_description"
    | "create_issue_nav_description"
    | "search_nav_description";
}[] = [
  {
    key: "inbox",
    icon: Inbox,
    titleKey: "inbox_nav_title",
    descriptionKey: "inbox_nav_description",
  },
  {
    key: "myIssues",
    icon: CircleUser,
    titleKey: "my_issues_nav_title",
    descriptionKey: "my_issues_nav_description",
  },
  {
    key: "createIssue",
    icon: SquarePen,
    titleKey: "create_issue_nav_title",
    descriptionKey: "create_issue_nav_description",
  },
  {
    key: "search",
    icon: Search,
    titleKey: "search_nav_title",
    descriptionKey: "search_nav_description",
  },
];

export function WorkspaceTab() {
  const { t } = useT("settings");
  const user = useAuthStore((s) => s.user);
  const workspace = useCurrentWorkspace();
  const wsId = useWorkspaceId();
  const { data: members = [], isFetched: membersFetched } = useQuery(memberListOptions(wsId));
  const qc = useQueryClient();
  const leaveWorkspace = useLeaveWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const navigation = useNavigation();
  const hasOnboarded = useHasOnboarded();

  /**
   * Send the user to a safe URL BEFORE the leave/delete mutation fires.
   * The destination is computed from the current cached workspace list,
   * minus the workspace that's about to go away.
   *
   * Why navigate first, not after:
   *   1. The backend broadcasts `workspace:deleted` / `member:removed` the
   *      moment the mutation lands. If the user is still on the soon-to-
   *      be-deleted workspace's URL when that event arrives, the realtime
   *      handler in `use-realtime-sync.ts` also triggers a relocation —
   *      and both code paths race with the mutation's own
   *      `invalidateQueries` refetch. The loser's in-flight fetch gets
   *      cancelled, surfacing as an unhandled `CancelledError`.
   *   2. Navigating first means by the time the WS event fires, the
   *      active workspace is already something else; the realtime
   *      handler's "current === deleted" check fails and its relocate
   *      branch no-ops.
   *   3. UX: the destructive flow feels instant (dialog closes → new
   *      workspace appears) even though the API hasn't responded yet.
   */
  const navigateAwayFromCurrentWorkspace = () => {
    const cachedList =
      qc.getQueryData<Workspace[]>(workspaceListOptions().queryKey) ?? [];
    const remaining = cachedList.filter((w) => w.id !== workspace?.id);
    // Clear the workspace-context singleton BEFORE navigating and BEFORE
    // the mutation fires. Three downstream consumers read it:
    //  1. Realtime `workspace:deleted` handler's "current === deleted"
    //     check — if the singleton still points at the deleting workspace
    //     when the WS event arrives, it fires a parallel relocate that
    //     races the mutation's invalidate and the settings page's own
    //     navigate, surfacing a CancelledError and a full-page reload.
    //  2. Chrome gating (`{slug && <AppSidebar />}` on desktop) — if the
    //     singleton lingers, the sidebar stays mounted while the deleted
    //     workspace is no longer in the list, and `useWorkspaceId` throws.
    //  3. API client's `X-Workspace-Slug` header — stale header post-
    //     delete is at best a 404, at worst leaks into the next query.
    // WorkspaceRouteLayout re-sets the singleton when a new workspace's
    // route mounts; clearing here is safe — either the next workspace
    // takes over immediately, or the new-workspace overlay takes over
    // (which has no workspace context, so null is correct).
    setCurrentWorkspace(null, null);
    navigation.push(resolvePostAuthDestination(remaining, hasOnboarded));
  };

  const [name, setName] = useState(workspace?.name ?? "");
  const [description, setDescription] = useState(workspace?.description ?? "");
  const [context, setContext] = useState(workspace?.context ?? "");
  const [moduleNavVisibility, setModuleNavVisibility] = useState(
    getWorkspaceModuleNavVisibility(workspace?.settings),
  );
  const [shortcutNavVisibility, setShortcutNavVisibility] = useState(
    getWorkspaceShortcutNavVisibility(workspace?.settings),
  );
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    variant?: "destructive";
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null;
  const canManageWorkspace = currentMember?.role === "owner";
  const isOwner = currentMember?.role === "owner";
  // Mirror the backend invariant (server/internal/handler/workspace.go:569):
  // a workspace must always have at least one owner, so the sole owner can't
  // leave. Pre-flight here instead of letting the 400 round-trip become a
  // confusing toast — disable Leave and tell the user what they need to do.
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isSoleOwner = isOwner && ownerCount <= 1;
  const isSoleMember = members.length <= 1;

  useEffect(() => {
    setName(workspace?.name ?? "");
    setDescription(workspace?.description ?? "");
    setContext(workspace?.context ?? "");
    setModuleNavVisibility(getWorkspaceModuleNavVisibility(workspace?.settings));
    setShortcutNavVisibility(getWorkspaceShortcutNavVisibility(workspace?.settings));
  }, [workspace]);

  const handleSaveGeneral = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, {
        name,
        description,
        context,
      });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success(t(($) => $.workspace.toast_saved));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.workspace.toast_save_failed));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNavigation = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const nextSettingsWithModules = withWorkspaceModuleNavVisibilityMap(
        workspace.settings,
        moduleNavVisibility,
      );
      const updated = await api.updateWorkspace(workspace.id, {
        settings: withWorkspaceShortcutNavVisibilityMap(
          nextSettingsWithModules,
          shortcutNavVisibility,
        ),
      });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success(t(($) => $.workspace.toast_saved));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.workspace.toast_save_failed));
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveWorkspace = () => {
    if (!workspace) return;
    setConfirmAction({
      title: t(($) => $.workspace.leave_confirm_title),
      description: t(($) => $.workspace.leave_confirm_description, { name: workspace.name }),
      variant: "destructive",
      onConfirm: async () => {
        setActionId("leave");
        navigateAwayFromCurrentWorkspace();
        try {
          await leaveWorkspace.mutateAsync(workspace.id);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : t(($) => $.workspace.toast_leave_failed));
        } finally {
          setActionId(null);
        }
      },
    });
  };

  const handleConfirmDelete = async () => {
    if (!workspace) return;
    setActionId("delete-workspace");
    // Close the dialog and navigate away FIRST. See navigateAwayFromCurrentWorkspace
    // comment for why: keeps the realtime `workspace:deleted` handler out
    // of the race so we don't end up with concurrent refetches cancelling
    // each other and surfacing CancelledError.
    setDeleteDialogOpen(false);
    navigateAwayFromCurrentWorkspace();
    try {
      await deleteWorkspace.mutateAsync(workspace.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.workspace.toast_delete_failed));
    } finally {
      setActionId(null);
    }
  };

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      {/* Workspace settings */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t(($) => $.workspace.section_general)}</h2>

        <Card>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t(($) => $.workspace.name_label)}</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManageWorkspace}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t(($) => $.workspace.description_label)}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={!canManageWorkspace}
                className="mt-1 resize-none"
                placeholder={t(($) => $.workspace.description_placeholder)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t(($) => $.workspace.context_label)}</Label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
                disabled={!canManageWorkspace}
                className="mt-1 resize-none"
                placeholder={t(($) => $.workspace.context_placeholder)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t(($) => $.workspace.slug_label)}</Label>
              <div className="mt-1 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {workspace.slug}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSaveGeneral}
                disabled={saving || !name.trim() || !canManageWorkspace}
              >
                <Save className="h-3 w-3" />
                {saving ? t(($) => $.workspace.saving) : t(($) => $.workspace.save)}
              </Button>
            </div>
            {!canManageWorkspace && (
              <p className="text-xs text-muted-foreground">
                {t(($) => $.workspace.manage_hint)}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t(($) => $.workspace.section_modules)}</h2>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {moduleRows.map((module) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.key}
                    className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label className="text-sm font-medium">
                          {t(($) => $.workspace[module.titleKey])}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t(($) => $.workspace[module.descriptionKey])}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                      <span className="text-xs text-muted-foreground">
                        {t(($) => $.workspace.module_nav_label)}
                      </span>
                      <Switch
                        checked={moduleNavVisibility[module.key]}
                        onCheckedChange={(checked) =>
                          setModuleNavVisibility((current) => ({
                            ...current,
                            [module.key]: checked,
                          }))
                        }
                        disabled={!canManageWorkspace}
                      />
                    </div>
                  </div>
                );
              })}
              {shortcutRows.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <div
                    key={shortcut.key}
                    className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label className="text-sm font-medium">
                          {t(($) => $.workspace[shortcut.titleKey])}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t(($) => $.workspace[shortcut.descriptionKey])}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                      <span className="text-xs text-muted-foreground">
                        {t(($) => $.workspace.module_nav_label)}
                      </span>
                      <Switch
                        checked={shortcutNavVisibility[shortcut.key]}
                        onCheckedChange={(checked) =>
                          setShortcutNavVisibility((current) => ({
                            ...current,
                            [shortcut.key]: checked,
                          }))
                        }
                        disabled={!canManageWorkspace}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSaveNavigation}
                disabled={saving || !canManageWorkspace}
              >
                <Save className="h-3 w-3" />
                {saving ? t(($) => $.workspace.saving) : t(($) => $.workspace.save)}
              </Button>
            </div>
            {!canManageWorkspace && (
              <p className="text-xs text-muted-foreground">
                {t(($) => $.workspace.manage_hint)}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Danger Zone — gated on the member query settling so the owner-only
          Delete button and the sole-owner Leave guidance don't flash in
          after mount. */}
      {membersFetched && (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <LogOut className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t(($) => $.workspace.danger_zone)}</h2>
        </div>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{t(($) => $.workspace.leave_title)}</p>
                <p className="text-xs text-muted-foreground">
                  {isSoleOwner
                    ? isSoleMember
                      ? t(($) => $.workspace.leave_sole_member)
                      : t(($) => $.workspace.leave_sole_owner)
                    : t(($) => $.workspace.leave_default)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLeaveWorkspace}
                disabled={actionId === "leave" || isSoleOwner}
              >
                {actionId === "leave" ? t(($) => $.workspace.leaving) : t(($) => $.workspace.leave_button)}
              </Button>
            </div>

            {isOwner && (
              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">{t(($) => $.workspace.delete_title)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(($) => $.workspace.delete_description)}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={actionId === "delete-workspace"}
                >
                  {actionId === "delete-workspace" ? t(($) => $.workspace.deleting) : t(($) => $.workspace.delete_button)}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={(v) => { if (!v) setConfirmAction(null); }}>
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
        loading={actionId === "delete-workspace"}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          // Ignore close requests while the delete mutation is in flight
          // so the user can't accidentally dismiss mid-operation.
          if (actionId === "delete-workspace" && !open) return;
          setDeleteDialogOpen(open);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
