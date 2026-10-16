"use client";

import { useModalStore } from "@iteamify/core/modals";
import { deferredFeature } from "../common/deferred-feature";
import { preloadEditors } from "../editor/deferred-editors";
const CreateWorkspaceModal = deferredFeature(() => import("./create-workspace").then((m) => ({ default: m.CreateWorkspaceModal })));
const CreateIssueDialog = deferredFeature(async () => {
  const [m] = await Promise.all([import("./create-issue-dialog"), preloadEditors()]);
  return { default: m.CreateIssueDialog };
});
const CreateProjectModal = deferredFeature(async () => {
  const [m] = await Promise.all([import("./create-project"), preloadEditors()]);
  return { default: m.CreateProjectModal };
});
const CreateSquadModal = deferredFeature(() => import("./create-squad").then((m) => ({ default: m.CreateSquadModal })));
const FeedbackModal = deferredFeature(async () => {
  const [m] = await Promise.all([import("./feedback"), preloadEditors()]);
  return { default: m.FeedbackModal };
});
const SetParentIssueModal = deferredFeature(() => import("./set-parent-issue").then((m) => ({ default: m.SetParentIssueModal })));
const AddChildIssueModal = deferredFeature(() => import("./add-child-issue").then((m) => ({ default: m.AddChildIssueModal })));
const DeleteIssueConfirmModal = deferredFeature(() => import("./delete-issue-confirm").then((m) => ({ default: m.DeleteIssueConfirmModal })));
const RunConfirmModal = deferredFeature(() => import("./run-confirm").then((m) => ({ default: m.RunConfirmModal })));

export function ModalRegistry() {
  const modal = useModalStore((s) => s.modal);
  const data = useModalStore((s) => s.data);
  const close = useModalStore((s) => s.close);

  switch (modal) {
    case "create-workspace":
      return <CreateWorkspaceModal onDismiss={close} onClose={close} />;
    // Both modal types open the same shell so the in-modal mode switch is
    // instant — only the inner panel swaps, the Dialog Root stays mounted.
    case "create-issue":
      return <CreateIssueDialog onDismiss={close} onClose={close} initialMode="manual" data={data} />;
    case "quick-create-issue":
      return <CreateIssueDialog onDismiss={close} onClose={close} initialMode="agent" data={data} />;
    case "create-project":
      return <CreateProjectModal onDismiss={close} onClose={close} />;
    case "create-squad":
      return <CreateSquadModal onDismiss={close} onClose={close} />;
    case "feedback":
      return <FeedbackModal onDismiss={close} onClose={close} data={data} />;
    case "issue-set-parent":
      return <SetParentIssueModal onDismiss={close} onClose={close} data={data} />;
    case "issue-add-child":
      return <AddChildIssueModal onDismiss={close} onClose={close} data={data} />;
    case "issue-delete-confirm":
      return <DeleteIssueConfirmModal onDismiss={close} onClose={close} data={data} />;
    case "issue-run-confirm":
      return <RunConfirmModal onDismiss={close} onClose={close} data={data} />;
    default:
      return null;
  }
}
