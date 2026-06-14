"use client"

import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@teamify/ui/components/ui/sidebar"
import { Badge } from "@teamify/ui/components/ui/badge"
import { useT } from "../../i18n"
import { useNavigation } from "../../navigation"
import type { Workflow, WorkflowStep } from "../lib/types"

interface WorkflowSidebarProps {
  workflow: Workflow
  activeStepId: string | undefined
}

export function WorkflowSidebar({ workflow, activeStepId }: WorkflowSidebarProps) {
  const { t } = useT("workflows")
  const navigation = useNavigation()

  const effectiveActive = activeStepId ?? workflow.steps[0]?.id ?? ""

  const handleStepClick = (step: WorkflowStep) => {
    navigation.replace(`/workflows/${workflow.id}?step=${step.id}`)
  }

  const handleBack = () => {
    navigation.push("/workflows")
  }

  const departments = new Set(workflow.steps.map((s) => s.department).filter(Boolean))
  const aiCoverage = workflow.steps.filter((s) => s.aiTasks).length

  return (
    <Sidebar collapsible="none" className="border-r">
      <SidebarHeader className="gap-2 border-b px-3 py-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          {t(($) => $.detail.backToList)}
        </button>
        <p className="text-sm font-medium truncate">{workflow.title}</p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-wider">
            {t(($) => $.sidebar.steps)} ({workflow.steps.length})
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workflow.steps.map((step) => (
                <SidebarMenuItem key={step.id}>
                  <SidebarMenuButton
                    isActive={effectiveActive === step.id}
                    onClick={() => handleStepClick(step)}
                    className="gap-2"
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border ${
                        effectiveActive === step.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {step.order}
                    </span>
                    <span className="truncate text-sm">{step.name}</span>
                    {step.department && (
                      <Badge variant="secondary" className="ml-auto shrink-0 text-[9px]">
                        {step.department}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-3 py-3">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold">{workflow.steps.length}</div>
            <div className="text-[10px] text-muted-foreground">{t(($) => $.sidebar.totalSteps)}</div>
          </div>
          <div>
            <div className="text-sm font-semibold">{departments.size}</div>
            <div className="text-[10px] text-muted-foreground">{t(($) => $.sidebar.departments)}</div>
          </div>
          <div className="col-span-2 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="size-3 text-green-500" />
            <div className="text-xs">
              <span className="font-semibold text-green-600">{aiCoverage}/{workflow.steps.length}</span>
              <span className="text-muted-foreground"> {t(($) => $.sidebar.aiCoverage)}</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
