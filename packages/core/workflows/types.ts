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
