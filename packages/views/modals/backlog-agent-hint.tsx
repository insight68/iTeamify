"use client";

import { toast } from "sonner";
import { BacklogAgentHintDialog } from "../issues/components/backlog-agent-hint-dialog";
import { useUpdateIssue } from "@teamify/core/issues/mutations";
import { defaultStorage } from "@teamify/core/platform";
import { useT } from "../i18n";

export function BacklogAgentHintModal({
  onClose,
  data,
}: {
  onClose: () => void;
  data: Record<string, unknown> | null;
}) {
  const { t } = useT("modals");
  const issueId = (data?.issueId as string) || "";
  const updateIssue = useUpdateIssue();

  return (
    <BacklogAgentHintDialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      onDismissPermanently={() => {
        defaultStorage.setItem("teamify:backlog-agent-hint-dismissed", "true");
      }}
      onMoveToTodo={() => {
        if (issueId) {
          updateIssue.mutate(
            { id: issueId, status: "todo" },
            { onError: () => toast.error(t(($) => $.backlog_hint.toast_status_failed)) },
          );
        }
        onClose();
      }}
    />
  );
}
