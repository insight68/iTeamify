"use client"

import { WorkflowDetailLayout } from "./workflow-detail-layout"

interface WorkflowDetailPageProps {
  workflowId: string
  activeStepId?: string
}

export function WorkflowDetailPage({ workflowId, activeStepId }: WorkflowDetailPageProps) {
  return <WorkflowDetailLayout workflowId={workflowId} activeStepId={activeStepId} />
}
