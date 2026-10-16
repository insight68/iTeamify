import { sessionContainerSchema } from "../session-containers/schemas";
import { z } from "zod";

export const agentSessionSchema = z.object({
  container: sessionContainerSchema.nullish().transform((v) => v ?? { type: "conversation" }),
  container_has_unread: z.boolean().optional(), last_activity_at: z.string().nullish(),
    id: z.string().uuid(), workspace_id: z.string().uuid(), agent_id: z.string().uuid(), creator_id: z.string().uuid(),
    project_id: z.string().uuid().nullable().optional(), title: z.string(), status: z.enum(["active", "archived"]),
    has_unread: z.boolean().default(false), unread_count: z.number().int().nonnegative().optional(), pinned: z.boolean().optional(),
    last_message: z.object({ content: z.string(), role: z.enum(["user", "assistant"]), created_at: z.string(), failure_reason: z.string().nullable().optional(), message_kind: z.enum(["message", "no_response"]).catch("message").optional() }).nullable().optional(),
    created_at: z.string(), updated_at: z.string(),
});
export const agentSessionsPageSchema = z.object({ sessions: z.array(agentSessionSchema), next_cursor: z.string().nullable() });
export const sendChatMessageSchema = z.object({
    message_id: z.string().uuid(), task_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
    // `nullish`, not `optional`: the handler serialises this field without
    // omitempty, so a send that requested no attachments emits `null` for the
    // nil slice — `.optional()` only admits `undefined` and would fail the
    // whole receipt (the send itself already committed server-side). All three
    // shapes must parse: absent (older server), null (no attachments), array.
    attachment_ids: z.array(z.string().uuid()).nullish(),
});
