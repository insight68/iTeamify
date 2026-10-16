import { z } from "zod";
import { applicationConfigSchema } from "./application-schemas";
export const sessionContainerSchema = z.object({
  type: z.string().min(1),
  resource: z.object({ type: z.string(), id: z.string().uuid() }).nullish(),
});
export type SessionContainer = z.infer<typeof sessionContainerSchema>;
export const contractFieldsSchema = z.object({
  title: z.string(), contract_type: z.string(), priority: z.enum(["normal", "high", "urgent"]),
  deadline: z.string(), opportunity_stage: z.string(), background: z.string(), focus: z.string(),
});
export type ContractFields = z.infer<typeof contractFieldsSchema>;
export const contractReviewSchema = z.object({
  configuration: applicationConfigSchema.nullish(),
  task: z.object({ id: z.string().uuid(), status: z.string(), error: z.string() }).nullish(),
  id: z.string().uuid(), session_id: z.string().uuid(), kind: z.enum(["agent", "direct"]), creator_id: z.string().uuid(),
  fields: contractFieldsSchema, status: z.string(), result: z.string(), note: z.string(), version: z.number().int().positive(),
  has_unread: z.boolean(), can_act: z.boolean(), updated_at: z.string(),
  files: z.array(z.object({ id: z.string().uuid(), filename: z.string(), content_type: z.string(), size_bytes: z.number().positive(), download_url: z.string() })).nullish().transform((v) => v ?? []),
  actions: z.array(z.object({ action: z.string(), note: z.string(), version: z.number().int().positive(), created_at: z.string() })).nullish().transform((v) => v ?? []),
});
export type ContractReview = z.infer<typeof contractReviewSchema>;
export interface CreateContractReviewInput { session_id: string; kind: "agent" | "direct"; agent_id?: string; peer_user_id?: string; fields: ContractFields; application_id: string; application_version: number }
export interface ContractActionInput { request_key: string; version: number; action: string; note: string; result: string; fields?: ContractFields }
