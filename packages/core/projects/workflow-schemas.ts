import { z } from "zod";

export const projectWorkflowSchema = z
  .object({
    id: z.string().min(1),
    workspace_id: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    lead_type: z.string().nullish(),
    lead_id: z.string().nullish(),
    acceptance_criteria: z.string().default(""),
    workflow_status: z.string(),
    result: z.string().default(""),
    review_note: z.string().default(""),
    version: z.number().int().positive(),
    execution_active: z.boolean().default(false),
    can_manage: z.boolean().default(false),
    can_submit: z.boolean().default(false),
    can_review: z.boolean().default(false),
  })
  .loose();

export const projectWorkflowListSchema = z.array(projectWorkflowSchema);
export type ProjectWorkflow = z.infer<typeof projectWorkflowSchema>;
export interface ProjectWorkflowAction {
  action: "edit" | "assign" | "submit" | "approve" | "reject" | "retry";
  version: number;
  assignee_type?: "member" | "agent";
  assignee_id?: string;
  title?: string;
  description?: string;
  acceptance_criteria?: string;
  result?: string;
  note?: string;
}
