"use client"

import { SidebarInset, SidebarProvider } from "@teamify/ui/components/ui/sidebar"
import { useWorkflowsStore } from "@teamify/core/workflows/store"
import { WorkflowSidebar } from "./workflow-sidebar"
import { StepDetailContent } from "./step-detail-content"
import { FileSpreadsheet } from "lucide-react"
import { Button } from "@teamify/ui/components/ui/button"
import { useT } from "../../i18n"
import { useNavigation } from "../../navigation"

interface WorkflowDetailLayoutProps {
  workflowId: string
  activeStepId: string | undefined
}

export function WorkflowDetailLayout({ workflowId, activeStepId }: WorkflowDetailLayoutProps) {
  const { t } = useT("workflows")
  const navigation = useNavigation()
  const workflow = useWorkflowsStore((s) => s.workflows.find((w) => w.id === workflowId))

  if (!workflow) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <FileSpreadsheet className="size-12 text-muted-foreground/40" />
          <div>
            <p className="text-lg font-medium">{t(($) => $.detail.notFound)}</p>
            <Button
              variant="link"
              onClick={() => navigation.push("/workflows")}
              className="mt-2"
            >
              {t(($) => $.detail.backToList)}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const step = activeStepId
    ? workflow.steps.find((s) => s.id === activeStepId)
    : workflow.steps[0]

  return (
    <SidebarProvider defaultOpen className="h-svh">
      <WorkflowSidebar workflow={workflow} activeStepId={activeStepId} />
      <SidebarInset className="overflow-y-auto">
        <StepDetailContent workflow={workflow} step={step} />
      </SidebarInset>
    </SidebarProvider>
  )
}
