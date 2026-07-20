import { z } from "zod";
import type { WSMessage, WSEventType } from "../types/events";

const knownEventTypes = new Set<WSEventType>([
  "issue:created", "issue:updated", "issue:deleted", "comment:created",
  "comment:updated", "comment:deleted", "comment:resolved", "comment:unresolved",
  "agent:status", "agent:created", "agent:archived", "agent:restored",
  "task:queued", "task:dispatch", "task:progress", "task:completed",
  "task:failed", "task:message", "task:cancelled", "inbox:new", "inbox:read",
  "inbox:archived", "inbox:batch-read", "inbox:batch-archived",
  "workspace:updated", "workspace:deleted", "member:added", "member:updated",
  "member:removed", "daemon:heartbeat", "daemon:register", "skill:created",
  "skill:updated", "skill:deleted", "subscriber:added", "subscriber:removed",
  "activity:created", "reaction:added", "reaction:removed",
  "issue_reaction:added", "issue_reaction:removed", "chat:message", "chat:done",
  "chat:session_read", "chat:session_deleted", "chat:table_filter",
  "reconciliation:filter", "project:created", "project:updated", "project:deleted",
  "inventory:updated",
  "label:created", "label:updated", "label:deleted", "issue_labels:changed",
  "pin:created", "pin:deleted", "pin:reordered", "invitation:created",
  "invitation:accepted", "invitation:declined", "invitation:revoked",
]);

const recordSchema = z.record(z.string(), z.unknown());
const entitySchema = z.object({ id: z.string().min(1) }).loose();
const issueEventSchema = z.object({ issue: entitySchema }).loose();
const commentEventSchema = z.object({ comment: recordSchema }).loose();

const payloadSchemas: Partial<Record<WSEventType, z.ZodType>> = {
  "issue:created": issueEventSchema,
  "issue:updated": issueEventSchema,
  "issue:deleted": z.object({ issue_id: z.string().min(1) }).loose(),
  "issue_labels:changed": z.object({ issue_id: z.string().min(1), labels: z.array(recordSchema) }).loose(),
  "inbox:new": z.object({ item: recordSchema }).loose(),
  "comment:created": commentEventSchema,
  "comment:updated": commentEventSchema,
  "comment:resolved": commentEventSchema,
  "comment:unresolved": commentEventSchema,
  "comment:deleted": z.object({ issue_id: z.string().min(1), comment_id: z.string().min(1) }).loose(),
  "activity:created": z.object({ issue_id: z.string().min(1), entry: recordSchema }).loose(),
  "reaction:added": z.object({ issue_id: z.string().min(1), reaction: recordSchema }).loose(),
  "reaction:removed": z.object({ issue_id: z.string().min(1), comment_id: z.string().min(1), emoji: z.string() }).loose(),
  "issue_reaction:added": z.object({ issue_id: z.string().min(1), reaction: recordSchema }).loose(),
  "issue_reaction:removed": z.object({ issue_id: z.string().min(1), emoji: z.string() }).loose(),
  "subscriber:added": z.object({ issue_id: z.string().min(1) }).loose(),
  "subscriber:removed": z.object({ issue_id: z.string().min(1) }).loose(),
  "workspace:deleted": z.object({ workspace_id: z.string().min(1) }).loose(),
  "member:removed": z.object({ user_id: z.string().min(1), workspace_id: z.string().min(1) }).loose(),
  "member:added": z.object({ member: recordSchema, workspace_id: z.string().min(1), workspace_name: z.string().optional() }).loose(),
  "invitation:created": z.object({ invitation: recordSchema, workspace_name: z.string().optional() }).loose(),
  "invitation:accepted": z.object({ invitation_id: z.string().min(1), member: recordSchema }).loose(),
  "invitation:declined": z.object({ invitation_id: z.string().min(1), invitee_email: z.string() }).loose(),
  "invitation:revoked": z.object({ invitation_id: z.string().min(1), invitee_email: z.string() }).loose(),
  "task:message": z.object({
    task_id: z.string().min(1), issue_id: z.string().optional(), chat_session_id: z.string().optional(),
    seq: z.number().int().nonnegative(), type: z.enum(["text", "thinking", "tool_use", "tool_result", "error"]),
  }).loose(),
  "chat:message": z.object({ chat_session_id: z.string().min(1) }).loose(),
  "chat:done": z.object({ chat_session_id: z.string().min(1), task_id: z.string().min(1), content: z.string().optional() }).loose(),
  "task:queued": z.object({ task_id: z.string().min(1), agent_id: z.string(), issue_id: z.string(), chat_session_id: z.string().optional(), status: z.string() }).loose(),
  "task:dispatch": z.object({ task_id: z.string().min(1), agent_id: z.string(), issue_id: z.string(), runtime_id: z.string(), chat_session_id: z.string().optional() }).loose(),
  "task:cancelled": z.object({ task_id: z.string().min(1), agent_id: z.string(), issue_id: z.string(), chat_session_id: z.string().optional(), status: z.string() }).loose(),
  "task:completed": z.object({ task_id: z.string().min(1), agent_id: z.string(), issue_id: z.string(), chat_session_id: z.string().optional(), status: z.string() }).loose(),
  "task:failed": z.object({ task_id: z.string().min(1), agent_id: z.string(), issue_id: z.string(), chat_session_id: z.string().optional(), status: z.string() }).loose(),
  "chat:session_read": z.object({ chat_session_id: z.string().min(1) }).loose(),
  "chat:session_deleted": z.object({ chat_session_id: z.string().min(1) }).loose(),
  "chat:table_filter": z.object({ chat_session_id: z.string().min(1), agent_id: z.string(), filters: recordSchema }).loose(),
  "reconciliation:filter": z.object({ chat_session_id: z.string().min(1), agent_id: z.string(), filters: recordSchema }).loose(),
  "inventory:updated": z.object({
    dataset: z.enum([
      "product_order",
      "dim_product",
      "allocation",
      "supply_inventory",
      "supply_inventory_snapshot",
    ]),
    refreshed_at: z.iso.datetime(),
    run_id: z.string().optional(),
  }).loose(),
};

const envelopeSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown(),
  actor_id: z.string().optional(),
}).loose();

export type ParsedWSFrame =
  | { kind: "auth_ack" }
  | { kind: "event"; message: WSMessage };

export interface InvalidWSFrame {
  reason:
    | "non_string"
    | "invalid_json"
    | "invalid_envelope"
    | "unknown_event"
    | "invalid_payload";
  eventType?: string;
  issues?: Array<{ path: string; message: string }>;
}

type InvalidWSFrameReporter = (details: InvalidWSFrame) => void;

function zodIssues(error: z.ZodError): InvalidWSFrame["issues"] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function parseWSFrame(
  data: unknown,
  reportInvalid?: InvalidWSFrameReporter,
): ParsedWSFrame | null {
  if (typeof data !== "string") {
    reportInvalid?.({ reason: "non_string" });
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    reportInvalid?.({ reason: "invalid_json" });
    return null;
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    reportInvalid?.({
      reason: "invalid_envelope",
      issues: zodIssues(envelope.error),
    });
    return null;
  }
  if (envelope.data.type === "auth_ack") return { kind: "auth_ack" };
  if (!knownEventTypes.has(envelope.data.type as WSEventType)) {
    reportInvalid?.({
      reason: "unknown_event",
      eventType: envelope.data.type,
    });
    return null;
  }

  const type = envelope.data.type as WSEventType;
  const payloadSchema = payloadSchemas[type];
  const payload = payloadSchema?.safeParse(envelope.data.payload);
  if (payload && !payload.success) {
    reportInvalid?.({
      reason: "invalid_payload",
      eventType: type,
      issues: zodIssues(payload.error),
    });
    return null;
  }
  return {
    kind: "event",
    message: {
      type,
      payload: payload?.data ?? envelope.data.payload,
      actor_id: envelope.data.actor_id,
    },
  };
}
