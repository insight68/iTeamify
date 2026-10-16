import { z } from "zod";

export const applicationConfigSchema = z.object({
  service_name: z.string(), description: z.string(), contract_types: z.array(z.string()).nullish().transform((v) => v ?? []),
  require_background: z.boolean(), require_focus: z.boolean(), default_priority: z.enum(["normal", "high", "urgent"]),
  review_instructions: z.string().default(""), result_requirements: z.string().default(""), agent_instructions: z.string().default(""),
});
export const sessionApplicationSchema = z.object({
  id: z.string().uuid(), type: z.string(), target_kind: z.enum(["member", "agent"]), target_id: z.string().uuid(), target_name: z.string(),
  status: z.string(), version: z.number().int().positive(), config: applicationConfigSchema, available: z.boolean(), updated_at: z.string(),
});
export const applicationsSchema = z.object({ applications: z.array(z.string()), can_manage: z.boolean(),
  providers: z.array(sessionApplicationSchema).nullish().transform((v) => v ?? []), configurations: z.array(sessionApplicationSchema).nullish().transform((v) => v ?? []),
});
export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;
export type SessionApplication = z.infer<typeof sessionApplicationSchema>;
export type Applications = z.infer<typeof applicationsSchema>;
export type ApplicationWrite = Pick<SessionApplication, "target_kind" | "target_id" | "status" | "version" | "config">;
