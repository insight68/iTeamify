"use client"

import { useState, useCallback } from "react"
import { ArrowRight, Trash2, FileSpreadsheet } from "lucide-react"
import { useWorkflowsStore } from "@teamify/core/workflows/store"
import { parseWorkflowExcel } from "../lib/parse-excel"
import { UploadZone } from "./upload-zone"
import { Button } from "@teamify/ui/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription } from "@teamify/ui/components/ui/card"
import { Badge } from "@teamify/ui/components/ui/badge"
import { useT } from "../../i18n"
import { useNavigation } from "../../navigation"

export function WorkflowsListPage() {
  const { t } = useT("workflows")
  const navigation = useNavigation()
  const workflows = useWorkflowsStore((s) => s.workflows)
  const addWorkflow = useWorkflowsStore((s) => s.addWorkflow)
  const removeWorkflow = useWorkflowsStore((s) => s.removeWorkflow)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      setError(null)
      try {
        const workflow = await parseWorkflowExcel(file)
        addWorkflow(workflow)
      } catch (err) {
        setError(err instanceof Error ? err.message : "解析失败")
      } finally {
        setUploading(false)
      }
    },
    [addWorkflow],
  )

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    removeWorkflow(id)
  }

  const getDepartmentCount = (workflow: (typeof workflows)[number]) => {
    const depts = new Set(workflow.steps.map((s) => s.department).filter(Boolean))
    return depts.size
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-semibold">{t(($) => $.page.title)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(($) => $.page.description)}</p>
      </div>

      {/* Upload zone */}
      <UploadZone onUpload={handleUpload} uploading={uploading} />

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Workflow list */}
      {workflows.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            {t(($) => $.page.existing)} ({workflows.length})
          </h2>
          <div className="grid gap-3">
            {workflows.map((wf) => (
              <Card
                key={wf.id}
                size="sm"
                className="cursor-pointer transition-shadow hover:ring-1 hover:ring-primary/30"
                onClick={() => navigation.push(`/workflows/${wf.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{wf.title}</CardTitle>
                      <CardDescription>
                        {wf.sourceFileName} · {wf.steps.length} {t(($) => $.common.steps)} ·{" "}
                        {getDepartmentCount(wf)} {t(($) => $.common.departments)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">
                        {wf.steps.length} 步
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => handleRemove(e, wf.id)}
                        aria-label="Remove workflow"
                      >
                        <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {workflows.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <FileSpreadsheet className="size-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t(($) => $.page.empty)}</p>
        </div>
      )}
    </div>
  )
}
