export interface WorkflowStep {
  id: string
  name: string
  department: string
  traditionalTasks: string
  aiTasks: string
  order: number
}

export interface Workflow {
  id: string
  title: string
  sourceFileName: string
  createdAt: string
  steps: WorkflowStep[]
}

// Demo types for AI-powered interactive demonstrations
export type DemoVisualType =
  | "document-scan"
  | "data-comparison"
  | "report-view"
  | "timeline-tracker"
  | "extraction-cards"
  | "file-organization"

export interface DemoStage {
  id: string
  title: string
  description: string
  visualType: DemoVisualType
  visualData: Record<string, unknown>
  result?: {
    summary: string
    highlights?: string[]
    warnings?: string[]
  }
}

export interface StepDemo {
  stepId: string
  stages: DemoStage[]
}
