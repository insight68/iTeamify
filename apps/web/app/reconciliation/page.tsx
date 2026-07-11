import { WorkflowDetailPage } from "@teamify/views/workflows";

export default function ReconciliationPage() {
  return (
    <div className="h-svh overflow-y-auto bg-background text-foreground">
      <WorkflowDetailPage workflowId="demo-procurement" activeStepId="step-9" />
    </div>
  );
}
