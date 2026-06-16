import type { ZodType } from "zod";
import { z } from "zod";
import { type Logger, noopLogger } from "../logger";

// Module-level logger for schema warnings. Defaults to no-op so test
// runs don't spam stderr; the platform layer wires a real logger via
// `setSchemaLogger` at app boot.
let schemaLogger: Logger = noopLogger;

export function setSchemaLogger(logger: Logger): void {
  schemaLogger = logger;
}

export interface ParseOptions {
  /** Endpoint identifier used in the warning log so we can grep for which
   *  contract drifted in production telemetry. */
  endpoint: string;
}

/**
 * Validate a JSON value parsed from an API response against a zod schema,
 * returning the parsed value on success or `fallback` on failure.
 *
 * On failure we log a warning with the endpoint and zod's structured error,
 * but never throw — the UI layer must keep rendering. This is the boundary
 * defense that turns "API contract drifted" from a white-screen incident
 * into a degraded-but-rendering page.
 *
 * The return type is anchored to `T` (inferred from `fallback`), not to the
 * schema's `z.infer` type. Schemas are intentionally **lenient** — string
 * enums kept as `z.string()` so an unknown enum value still parses, etc. —
 * so the parsed runtime value can be wider than the strict TS type at the
 * call site. The caller asserts compatibility by typing the fallback to the
 * expected `T`; downstream code is already responsible for handling unknown
 * enum values via `default`-bearing switches and optional chaining.
 *
 * See CLAUDE.md "API Response Compatibility" for when to reach for this.
 */
export function parseWithFallback<T>(
  data: unknown,
  schema: ZodType,
  fallback: T,
  opts: ParseOptions,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data as T;
  schemaLogger.warn(
    `API response failed schema validation: ${opts.endpoint}`,
    {
      endpoint: opts.endpoint,
      issues: result.error.issues,
      received: data,
    },
  );
  return fallback;
}

// Re-export invitation preview schema for the signup flow.
export const EMPTY_INVITATION_PREVIEW: import("../types").InvitationPreview = {
  id: "",
  workspace_id: "",
  invitee_email: "",
  invitee_phone: "",
  role: "member",
  status: "pending",
  expires_at: "",
  user_exists: false,
};

export const InvitationPreviewSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  invitee_email: z.string(),
  invitee_phone: z.string().optional(),
  role: z.string(),
  status: z.string(),
  expires_at: z.string(),
  workspace_name: z.string().optional(),
  inviter_name: z.string().optional(),
  inviter_email: z.string().optional(),
  user_exists: z.boolean(),
}).loose();
