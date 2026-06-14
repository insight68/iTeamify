import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { defaultStorage } from "../platform/storage"
import type { Workflow } from "./types"
import { DEMO_WORKFLOW } from "./demo-data"

const STORAGE_KEY = "teamify_workflows"

interface WorkflowsState {
  workflows: Workflow[]
  addWorkflow: (workflow: Workflow) => void
  removeWorkflow: (id: string) => void
}

export const useWorkflowsStore = create<WorkflowsState>()(
  persist(
    (set) => ({
      workflows: [DEMO_WORKFLOW],
      addWorkflow: (workflow) =>
        set((s) => ({ workflows: [workflow, ...s.workflows] })),
      removeWorkflow: (id) =>
        set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => defaultStorage),
      merge: (persisted, current) => {
        const parsed = persisted as { workflows?: Workflow[] } | undefined
        const persistedWorkflows = parsed?.workflows ?? []

        const hasDemo = persistedWorkflows.some((w) => w.id === DEMO_WORKFLOW.id)
        const merged = hasDemo
          ? persistedWorkflows
          : [DEMO_WORKFLOW, ...persistedWorkflows]

        return {
          ...current,
          workflows: merged,
        }
      },
    },
  ),
)
