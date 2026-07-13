import { z } from "zod";
import type { ListIssuesResponse, TimelineEntry } from "../types";

// ---------------------------------------------------------------------------
// Schemas for the highest-risk API endpoints — those whose responses drive
// the issue detail page (timeline, comments, subscribers) and the issues
// list. These are the surfaces that white-screened in #2143 / #2147 / #2192.
//
// These schemas are intentionally LENIENT:
//   - String enums are stored as `z.string()` rather than `z.enum([...])`.
//     A new server-side enum value should render as a generic fallback in
//     the UI, never crash a `safeParse`.
//   - Optional fields are unioned with `null` and given fallbacks where
//     existing UI code already coerces them.
//   - Arrays default to `[]` so a missing `reactions` / `attachments` /
//     `entries` field doesn't take the page down.
//   - Every object schema ends with `.loose()` so unknown server-side
//     fields pass through unchanged. zod 4's `.object()` defaults to STRIP,
//     which would silently delete fields the schema didn't explicitly list
//     — fine while the TS type doesn't claim them, but the moment a future
//     PR adds a TS field without updating the schema, the cast `as T` lies
//     and the field shows up as `undefined` at runtime. `.loose()` removes
//     that synchronisation hazard.
//
// These schemas are deliberately not typed as `z.ZodType<TimelineEntry>` /
// `z.ZodType<Issue>` etc. — the strict TS types narrow string fields to
// literal unions, which would defeat the leniency above. `parseWithFallback`
// returns the parsed value cast to the caller-supplied `T`, so the strict
// type still flows out at the call site; the schema only guards shape.
// ---------------------------------------------------------------------------

const ReactionSchema = z.object({
  id: z.string(),
  comment_id: z.string(),
  actor_type: z.string(),
  actor_id: z.string(),
  emoji: z.string(),
  created_at: z.string(),
});

const AttachmentSchema = z.object({
  id: z.string(),
}).loose();

// All object schemas use `.loose()` so unknown server-side fields pass
// through unchanged. zod 4's `.object()` defaults to STRIP, which would
// silently drop new fields and surface as a "field neither showed up in
// the UI" mystery the next time the TS type adopted them but the schema
// wasn't updated in lock-step. `.loose()` removes that synchronisation
// hazard — the schema validates the shape it knows about and leaves the
// rest alone.
const TimelineEntrySchema = z.object({
  type: z.string(),
  id: z.string(),
  actor_type: z.string(),
  actor_id: z.string(),
  created_at: z.string(),
  action: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
  parent_id: z.string().nullable().optional(),
  updated_at: z.string().optional(),
  comment_type: z.string().optional(),
  reactions: z.array(ReactionSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  coalesced_count: z.number().optional(),
}).loose();

// /timeline returns a flat array of TimelineEntry, oldest first. The
// previously cursor-paginated wrapper was removed (#1929) — at observed data
// sizes (p99 ~30 entries per issue) paged delivery only created bugs.
export const TimelineEntriesSchema = z.array(TimelineEntrySchema);

export const EMPTY_TIMELINE_ENTRIES: TimelineEntry[] = [];

export const CommentSchema = z.object({
  id: z.string(),
  issue_id: z.string(),
  author_type: z.string(),
  author_id: z.string(),
  content: z.string(),
  type: z.string(),
  parent_id: z.string().nullable(),
  reactions: z.array(ReactionSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const CommentsListSchema = z.array(CommentSchema);

const IssueSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  number: z.number(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  assignee_type: z.string().nullable(),
  assignee_id: z.string().nullable(),
  creator_type: z.string(),
  creator_id: z.string(),
  parent_issue_id: z.string().nullable(),
  project_id: z.string().nullable(),
  position: z.number(),
  due_date: z.string().nullable(),
  reactions: z.array(z.unknown()).optional(),
  labels: z.array(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const ListIssuesResponseSchema = z.object({
  issues: z.array(IssueSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_ISSUES_RESPONSE: ListIssuesResponse = {
  issues: [],
  total: 0,
};

const SubscriberSchema = z.object({
  issue_id: z.string(),
  user_type: z.string(),
  user_id: z.string(),
  reason: z.string(),
  created_at: z.string(),
}).loose();

export const SubscribersListSchema = z.array(SubscriberSchema);

export const ChildIssuesResponseSchema = z.object({
  issues: z.array(IssueSchema).default([]),
}).loose();

// ── Chat table config ──

const TableOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const TableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  editable: z.boolean().default(false),
  visible: z.boolean().default(true),
  width: z.number().optional(),
  grow: z.boolean().optional(),
  options: z.array(TableOptionSchema).optional(),
}).loose();

const TableFilterSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  options: z.array(TableOptionSchema).optional(),
  default_value: z.unknown().optional(),
}).loose();

const TableDataSourceSchema = z.object({
  tool_name: z.string(),
  tool_params: z.record(z.string(), z.unknown()).default({}),
  response_data_path: z.string(),
  save_tool_name: z.string().optional(),
  create_tool_name: z.string().optional(),
  delete_tool_name: z.string().optional(),
  save_params_mapping: z.record(z.string(), z.string()).optional(),
}).loose();

export const ChatTableConfigSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().default(""),
  data_source_id: z.string().optional(),
  data_table_name: z.string().optional(),
  mcp_tool: TableDataSourceSchema.optional(),
  columns: z.array(TableColumnSchema).default([]),
  filters: z.array(TableFilterSchema).default([]),
  page_size: z.number().default(20),
  default_sort: z.object({
    column: z.string(),
    direction: z.string(),
  }).optional(),
}).loose();

// ── Agent table data (POST /api/agents/{id}/table-data) ──

export const AgentTableDataResponseSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_AGENT_TABLE_DATA = {
  rows: [] as Record<string, unknown>[],
  total: 0,
};

// ── Agent table save (PUT /api/agents/{id}/table-data) ──

export const AgentTableSaveResponseSchema = z.object({
  success: z.boolean().default(false),
  row: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
}).loose();

export const EMPTY_AGENT_TABLE_SAVE: {
  success: boolean;
  row?: Record<string, unknown>;
  error?: string;
} = {
  success: false,
  error: "schema validation failed — falling back to empty response",
};

import type { ChatTableConfig, ReconciliationConfig } from "../types/agent";

export const EMPTY_CHAT_TABLE_CONFIG: ChatTableConfig = {
  enabled: false,
  title: "",
  columns: [],
  filters: [],
  page_size: 20,
};

// ── Reconciliation summary (POST /api/agents/{id}/reconciliation/summary) ──

export const ConfirmStatusSchema = z.object({
  confirmed: z.boolean().default(false),
  confirmed_by: z.string().optional(),
  confirmed_at: z.string().optional(),
  locked: z.boolean().default(false),
  locked_at: z.string().optional(),
  locked_by: z.string().optional(),
  status: z.string().optional(),
  unlockable: z.boolean().optional(),
}).loose();

export const ReconciliationSummaryResponseSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  total: z.number().default(0),
  confirmation_status: z.record(z.string(), ConfirmStatusSchema).default({}),
}).loose();

export const EMPTY_RECONCILIATION_SUMMARY = {
  rows: [] as Record<string, unknown>[],
  total: 0,
  confirmation_status: {} as Record<string, {
    confirmed: boolean;
    confirmed_by?: string;
    confirmed_at?: string;
    locked: boolean;
    locked_at?: string;
    locked_by?: string;
    status?: string;
    unlockable?: boolean;
  }>,
};

export const ReconciliationConfirmFailureSchema = z.object({
  batch_no: z.string().default(""),
  code: z.string().default("unknown"),
  message: z.string().default("Confirmation failed"),
}).loose();

export const ReconciliationConfirmResponseSchema = z.object({
  success: z.boolean().default(false),
  confirmed: z.array(z.string()).default([]),
  // Optional for compatibility with older servers.
  failed: z.array(ReconciliationConfirmFailureSchema).default([]),
}).loose();

export const EMPTY_RECONCILIATION_CONFIRM = {
  success: false,
  confirmed: [] as string[],
  failed: [{
    batch_no: "",
    code: "invalid_response",
    message: "The server returned an invalid confirmation response",
  }],
};

export const EMPTY_RECONCILIATION_CONFIG: ReconciliationConfig = {
  enabled: false,
  title: "",
  batch_no_column: "batch_no",
  confirmable: false,
  columns: [],
  filters: [],
  page_size: 20,
};

export const InventoryDashboardResponseSchema = z.object({
  batch: z.object({
    id: z.string().default(""),
    batch_no: z.string().default(""),
    snapshot_at: z.string().default(""),
    expected_next_at: z.string().optional(),
    delayed: z.boolean().default(false),
  }).loose(),
  metrics: z.object({
    total_recommendations: z.number().default(0),
    critical_count: z.number().default(0),
    shortage_count: z.number().default(0),
    pending_count: z.number().default(0),
    total_suggested_qty: z.number().default(0),
    estimated_saved_sales_qty: z.number().default(0),
    estimated_benefit_amount: z.number().default(0),
  }).loose(),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_INVENTORY_DASHBOARD = {
  batch: { id: "", batch_no: "", snapshot_at: "", delayed: false },
  metrics: {
    total_recommendations: 0, critical_count: 0, shortage_count: 0,
    pending_count: 0, total_suggested_qty: 0,
    estimated_saved_sales_qty: 0, estimated_benefit_amount: 0,
  },
  rows: [] as Record<string, unknown>[],
  total: 0,
};

const InventorySalesTrendSummarySchema = z.object({
  net_sales_qty: z.number().default(0),
  average_daily_qty: z.number().default(0),
  previous_change_rate: z.number().nullable().optional(),
  refund_rate: z.number().default(0),
}).loose();

export const InventorySalesTrendResponseSchema = z.object({
  mode: z.string().default("overall"),
  latest_stat_date: z.string().default(""),
  latest_partial: z.boolean().default(false),
  summary: InventorySalesTrendSummarySchema.default({
    net_sales_qty: 0, average_daily_qty: 0, refund_rate: 0,
  }),
  series_summary: z.record(z.string(), InventorySalesTrendSummarySchema).default({}),
  points: z.array(z.object({
    stat_date: z.string(),
    series_key: z.string(),
    series_name: z.string().default(""),
    sales_qty: z.number().default(0),
    refund_qty: z.number().default(0),
    net_sales_qty: z.number().default(0),
    sales_count: z.number().default(0),
    moving_average_7d: z.number().default(0),
    partial: z.boolean().default(false),
  }).loose()).default([]),
}).loose();

export const EMPTY_INVENTORY_SALES_TREND = {
  mode: "overall",
  latest_stat_date: "",
  latest_partial: false,
  summary: { net_sales_qty: 0, average_daily_qty: 0, previous_change_rate: null as number | null, refund_rate: 0 },
  series_summary: {} as Record<string, { net_sales_qty: number; average_daily_qty: number; previous_change_rate?: number | null; refund_rate: number }>,
  points: [] as Array<{
    stat_date: string; series_key: string; series_name: string;
    sales_qty: number; refund_qty: number; net_sales_qty: number;
    sales_count: number; moving_average_7d: number; partial: boolean;
  }>,
};
