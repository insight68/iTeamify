import { sessionContainerSchema } from "../session-containers/schemas";
import { z } from "zod";
export const teamActivitySchema = z.array(z.object({
    target_type: z.enum(["agent", "member"]),
    target_id: z.string().uuid(),
    last_contact_at: z.string().datetime({ offset: true }).nullable(),
    resume_session_id: z.string().uuid().nullable(),
    has_unread: z.boolean(),
}));
export const directMessageSchema = z.object({
    chat_session_id: z.string().uuid(),
    id: z.string().uuid(),
    sender_id: z.string().uuid(),
    client_message_id: z.string().uuid(),
    sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    content: z.string(),
    created_at: z.string().datetime({ offset: true }),
});
export const directMessagesPageSchema = z.object({
    messages: z.array(directMessageSchema),
    has_more: z.boolean(),
    next_cursor: z.number().int().positive().nullable(),
    read_sequence: z.number().int().nonnegative(),
    can_send: z.boolean(),
});
export const directSessionSchema = z.object({
  container: sessionContainerSchema.nullish().transform((v) => v ?? { type: "conversation" }),
  container_has_unread: z.boolean().optional(), last_activity_at: z.string().nullish(),
    id: z.string().uuid(), workspace_id: z.string().uuid(), kind: z.literal("direct"),
    peer_user_id: z.string().uuid(), title: z.string(), has_unread: z.boolean(),
    last_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    last_message_at: z.string().datetime({ offset: true }).nullable(),
    last_message_content: z.string(), created_at: z.string().datetime({ offset: true }),
});
export const directSessionsPageSchema = z.object({ sessions: z.array(directSessionSchema), next_cursor: z.string().nullable() });
export const directSendSchema = z.object({ session: directSessionSchema, message: directMessageSchema });
