"use client";

import { lazy, Suspense } from "react";
import { useModalStore } from "@teamify/core/modals";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";

const CreateWorkspaceModal = lazy(() =>
  import("./create-workspace").then((m) => ({ default: m.CreateWorkspaceModal })),
);
const CreateIssueDialog = lazy(() =>
  import("./create-issue-dialog").then((m) => ({ default: m.CreateIssueDialog })),
);
const CreateProjectModal = lazy(() =>
  import("./create-project").then((m) => ({ default: m.CreateProjectModal })),
);
const FeedbackModal = lazy(() =>
  import("./feedback").then((m) => ({ default: m.FeedbackModal })),
);
const SetParentIssueModal = lazy(() =>
  import("./set-parent-issue").then((m) => ({ default: m.SetParentIssueModal })),
);
const AddChildIssueModal = lazy(() =>
  import("./add-child-issue").then((m) => ({ default: m.AddChildIssueModal })),
);
const DeleteIssueConfirmModal = lazy(() =>
  import("./delete-issue-confirm").then((m) => ({ default: m.DeleteIssueConfirmModal })),
);
const BacklogAgentHintModal = lazy(() =>
  import("./backlog-agent-hint").then((m) => ({ default: m.BacklogAgentHintModal })),
);

function ModalSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <Skeleton className="h-96 w-full max-w-lg rounded-xl" />
    </div>
  );
}

export function ModalRegistry() {
  const modal = useModalStore((s) => s.modal);
  const data = useModalStore((s) => s.data);
  const close = useModalStore((s) => s.close);

  return (
    <Suspense fallback={<ModalSkeleton />}>
      {renderModal(modal, data, close)}
    </Suspense>
  );
}

function renderModal(
  modal: string | null,
  data: Record<string, unknown> | null,
  close: () => void,
) {
  switch (modal) {
    case "create-workspace":
      return <CreateWorkspaceModal onClose={close} />;
    case "create-issue":
      return <CreateIssueDialog onClose={close} initialMode="manual" data={data} />;
    case "quick-create-issue":
      return <CreateIssueDialog onClose={close} initialMode="agent" data={data} />;
    case "create-project":
      return <CreateProjectModal onClose={close} />;
    case "feedback":
      return <FeedbackModal onClose={close} />;
    case "issue-set-parent":
      return <SetParentIssueModal onClose={close} data={data} />;
    case "issue-add-child":
      return <AddChildIssueModal onClose={close} data={data} />;
    case "issue-delete-confirm":
      return <DeleteIssueConfirmModal onClose={close} data={data} />;
    case "issue-backlog-agent-hint":
      return <BacklogAgentHintModal onClose={close} data={data} />;
    default:
      return null;
  }
}
