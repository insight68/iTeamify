import { useT } from "../../i18n";

export function useWorkflowLabels() {
  const { t } = useT("projects");
  return {
    planned: t(($) => $.workflow.planned),
    in_progress: t(($) => $.workflow.in_progress),
    in_review: t(($) => $.workflow.in_review),
    completed: t(($) => $.workflow.completed),
    cancelled: t(($) => $.workflow.cancelled),
  };
}

export function WorkflowStatus({ status }: { status: string }) {
  const labels = useWorkflowLabels();
  const { t } = useT("projects");
  const label =
    labels[status as keyof typeof labels] ?? t(($) => $.workflow.unknown);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs ${status === "in_review" ? "bg-warning/10 text-warning" : status === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
