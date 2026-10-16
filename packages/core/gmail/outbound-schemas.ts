import { z } from "zod";

export const OutboundEmailSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  chat_session_id: z.string().uuid(),
  task_id: z.string(),
  connection_id: z.string().uuid(),
  from_address: z.string(),
  to_addresses: z.array(z.string()),
  cc_addresses: z.array(z.string()),
  bcc_addresses: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.object({
    id: z.string().uuid(), filename: z.string(), content_type: z.string(), size_bytes: z.number().nonnegative(),
  })),
  version: z.number().int().positive(),
  // Unknown future states are visible and cannot expose Send/Edit controls.
  status: z.string(),
  error_code: z.string(),
  gmail_message_id: z.string(),
  created_at: z.string(),
  sent_at: z.string().nullable(),
});

export type OutboundEmail = z.infer<typeof OutboundEmailSchema>;
export const OutboundEmailListSchema = z.array(OutboundEmailSchema);
export interface EmailDraft {
  connection_id: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  body: string;
  attachment_ids: string[];
}

export function emailDraftFromRecord(email: OutboundEmail): EmailDraft {
  return {
    connection_id: email.connection_id,
    to_addresses: email.to_addresses, cc_addresses: email.cc_addresses, bcc_addresses: email.bcc_addresses,
    subject: email.subject, body: email.body, attachment_ids: email.attachments.map((a) => a.id),
  };
}
