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
  row_key: z.string().optional(),
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

export const InventoryConfigResponseSchema = z.object({
  inventory_available: z.boolean().default(false),
  inventory_reason: z.string().default(""),
  sales_trend_available: z.boolean().default(false),
  sales_trend_reason: z.string().default(""),
  allocation_available: z.boolean().default(false),
  allocation_reason: z.string().default(""),
  monitor_available: z.boolean().default(false),
  monitor_reason: z.string().default(""),
  latest_inventory_date: z.string().default(""),
  latest_inventory_updated_at: z.union([z.iso.datetime(), z.literal("")]).default(""),
  inventory_stale: z.boolean().default(false),
  latest_stat_date: z.string().default(""),
  refresh_interval_minutes: z.number().int().positive().default(60),
  read_only: z.boolean().default(true),
}).loose();

export const EMPTY_INVENTORY_CONFIG = {
  inventory_available: false,
  inventory_reason: "invalid_response",
  sales_trend_available: false,
  sales_trend_reason: "invalid_response",
  allocation_available: false,
  allocation_reason: "invalid_response",
  monitor_available: false,
  monitor_reason: "invalid_response",
  latest_inventory_date: "",
  latest_inventory_updated_at: "",
  inventory_stale: false,
  latest_stat_date: "",
  refresh_interval_minutes: 60,
  read_only: true,
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

const InventoryStockSummarySchema = z.object({
  goods_count: z.number().int().nonnegative().default(0),
  warehouse_count: z.number().int().nonnegative().default(0),
  record_count: z.number().int().nonnegative().default(0),
  qty_on_hand: z.number().default(0),
  qty_available: z.number().default(0),
  qty_in_transit: z.number().default(0),
  qty_locked: z.number().default(0),
  qty_reserved: z.number().default(0),
  qty_damaged: z.number().default(0),
}).loose();

const InventoryStockWarehouseSchema = z.object({
  warehouse_no: z.string().default(""),
  warehouse_name: z.string().default(""),
  warehouse_type: z.string().default(""),
}).loose();

const InventoryStockRowSchema = z.object({
  goods_no: z.string().default(""),
  goods_name: z.string().default(""),
  warehouse_no: z.string().default(""),
  warehouse_name: z.string().default(""),
  warehouse_type: z.string().default(""),
  unit_name: z.string().default(""),
  batch_count: z.number().int().nonnegative().default(0),
  qty_on_hand: z.number().default(0),
  qty_available: z.number().default(0),
  qty_in_transit: z.number().default(0),
  qty_locked: z.number().default(0),
  qty_reserved: z.number().default(0),
  qty_damaged: z.number().default(0),
}).loose();

export const InventoryStockResponseSchema = z.object({
  snapshot_date: z.string().default(""),
  summary: InventoryStockSummarySchema.default({
    goods_count: 0,
    warehouse_count: 0,
    record_count: 0,
    qty_on_hand: 0,
    qty_available: 0,
    qty_in_transit: 0,
    qty_locked: 0,
    qty_reserved: 0,
    qty_damaged: 0,
  }),
  warehouses: z.array(InventoryStockWarehouseSchema).default([]),
  rows: z.array(InventoryStockRowSchema).default([]),
  total: z.number().int().nonnegative().default(0),
}).loose();

export const EMPTY_INVENTORY_STOCK = {
  snapshot_date: "",
  summary: {
    goods_count: 0,
    warehouse_count: 0,
    record_count: 0,
    qty_on_hand: 0,
    qty_available: 0,
    qty_in_transit: 0,
    qty_locked: 0,
    qty_reserved: 0,
    qty_damaged: 0,
  },
  warehouses: [] as Array<{
    warehouse_no: string;
    warehouse_name: string;
    warehouse_type: string;
  }>,
  rows: [] as Array<{
    goods_no: string;
    goods_name: string;
    warehouse_no: string;
    warehouse_name: string;
    warehouse_type: string;
    unit_name: string;
    batch_count: number;
    qty_on_hand: number;
    qty_available: number;
    qty_in_transit: number;
    qty_locked: number;
    qty_reserved: number;
    qty_damaged: number;
  }>,
  total: 0,
};

const InventoryMonitorDailySalesSchema = z.object({
  date: z.string(),
  net_sales_qty: z.number().default(0),
}).loose();

const InventoryMonitorSalesMonthSchema = z.object({
  month: z.string(),
  through_date: z.string(),
  partial: z.boolean().default(false),
}).loose();

const InventoryMonitorMonthlySalesSchema = z.object({
  month: z.string(),
  net_sales_qty: z.number().default(0),
}).loose();

const InventoryMonitorRowSchema = z.object({
  product_no: z.string().default(""),
  category_name: z.string().default(""),
  series_name: z.string().default(""),
  material_code: z.string().default(""),
  material_name: z.string().default(""),
  month_net_sales_qty: z.number().default(0),
  monthly_sales: z.array(InventoryMonitorMonthlySalesSchema).default([]),
  total_stock_qty: z.number().default(0),
  cloud_stock_qty: z.number().default(0),
  daily_sales: z.array(InventoryMonitorDailySalesSchema).default([]),
  average_daily_sales_3d: z.number().default(0),
  turnover_days: z.number().int().nullable().default(null),
  turnover_status: z.enum(["normal", "warning", "no_sales"]).default("normal"),
}).loose();

const InventoryMonitorSummarySchema = z.object({
  product_count: z.number().int().nonnegative().default(0),
  month_net_sales_qty: z.number().default(0),
  monthly_sales: z.array(InventoryMonitorMonthlySalesSchema).default([]),
  total_stock_qty: z.number().default(0),
  cloud_stock_qty: z.number().default(0),
  average_daily_sales_3d: z.number().default(0),
  overall_turnover_days: z.number().int().nullable().default(null),
  warning_count: z.number().int().nonnegative().default(0),
  no_sales_count: z.number().int().nonnegative().default(0),
}).loose();

export const InventoryMonitorResponseSchema = z.object({
  meta: z.object({
    sales_through_date: z.string().default(""),
    sales_dates: z.array(z.string()).default([]),
    sales_months: z.array(InventoryMonitorSalesMonthSchema).default([]),
    turnover_window_days: z.number().int().positive().default(3),
    turnover_warning_days: z.number().int().positive().default(90),
    inventory_sources: z.array(z.object({
      source: z.string().default(""),
      warehouse_no: z.string().default(""),
      warehouse_name: z.string().default(""),
      warehouse_type: z.string().default(""),
      snapshot_date: z.string().default(""),
      updated_at: z.union([z.iso.datetime(), z.literal("")]).default(""),
    }).loose()).default([]),
  }).loose().default({
    sales_through_date: "",
    sales_dates: [],
    sales_months: [],
    turnover_window_days: 3,
    turnover_warning_days: 90,
    inventory_sources: [],
  }),
  summary: InventoryMonitorSummarySchema.default({
    product_count: 0,
    month_net_sales_qty: 0,
    monthly_sales: [],
    total_stock_qty: 0,
    cloud_stock_qty: 0,
    average_daily_sales_3d: 0,
    overall_turnover_days: null,
    warning_count: 0,
    no_sales_count: 0,
  }),
  categories: z.array(z.string()).default([]),
  series: z.array(z.string()).default([]),
  warehouses: z.array(InventoryStockWarehouseSchema).default([]),
  rows: z.array(InventoryMonitorRowSchema).default([]),
  total: z.number().int().nonnegative().default(0),
}).loose();

export const EMPTY_INVENTORY_MONITOR = {
  meta: {
    sales_through_date: "",
    sales_dates: [] as string[],
    sales_months: [] as Array<{
      month: string;
      through_date: string;
      partial: boolean;
    }>,
    turnover_window_days: 3,
    turnover_warning_days: 90,
    inventory_sources: [] as Array<{
      source: string;
      warehouse_no: string;
      warehouse_name: string;
      warehouse_type: string;
      snapshot_date: string;
      updated_at: string;
    }>,
  },
  summary: {
    product_count: 0,
    month_net_sales_qty: 0,
    monthly_sales: [] as Array<{ month: string; net_sales_qty: number }>,
    total_stock_qty: 0,
    cloud_stock_qty: 0,
    average_daily_sales_3d: 0,
    overall_turnover_days: null as number | null,
    warning_count: 0,
    no_sales_count: 0,
  },
  categories: [] as string[],
  series: [] as string[],
  warehouses: [] as Array<{
    warehouse_no: string;
    warehouse_name: string;
    warehouse_type: string;
  }>,
  rows: [] as Array<{
    product_no: string;
    category_name: string;
    series_name: string;
    material_code: string;
    material_name: string;
    month_net_sales_qty: number;
    monthly_sales: Array<{ month: string; net_sales_qty: number }>;
    total_stock_qty: number;
    cloud_stock_qty: number;
    daily_sales: Array<{ date: string; net_sales_qty: number }>;
    average_daily_sales_3d: number;
    turnover_days: number | null;
    turnover_status: "normal" | "warning" | "no_sales";
  }>,
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

const ProductCategoryRowSchema = z.object({
  material_code: z.string().default(""),
  product_no: z.string().default(""),
  product_name: z.string().default(""),
  brand_name: z.string().default(""),
  class_name: z.string().default(""),
  business_category_name: z.string().default(""),
  product_series_name: z.string().default(""),
  taxonomy_status: z.string().default("unmapped"),
  taxonomy_source: z.string().default(""),
  taxonomy_updated_at: z.union([z.iso.datetime(), z.literal("")]).default(""),
  synced_records: z.number().int().nonnegative().default(0),
  credential_count: z.number().int().nonnegative().default(0),
}).loose();

const EMPTY_PRODUCT_CATEGORY_ROW = {
  material_code: "",
  product_no: "",
  product_name: "",
  brand_name: "",
  class_name: "",
  business_category_name: "",
  product_series_name: "",
  taxonomy_status: "unmapped",
  taxonomy_source: "",
  taxonomy_updated_at: "",
  synced_records: 0,
  credential_count: 0,
};

const ProductCategorySummarySchema = z.object({
  total: z.number().int().nonnegative().default(0),
  mapped: z.number().int().nonnegative().default(0),
  unmapped: z.number().int().nonnegative().default(0),
  mixed: z.number().int().nonnegative().default(0),
  category_count: z.number().int().nonnegative().default(0),
  series_count: z.number().int().nonnegative().default(0),
  last_updated_at: z.union([z.iso.datetime(), z.literal("")]).default(""),
}).loose();

export const ProductCategoryListResponseSchema = z.object({
  available: z.boolean().default(false),
  reason: z.string().default(""),
  summary: ProductCategorySummarySchema.default({
    total: 0,
    mapped: 0,
    unmapped: 0,
    mixed: 0,
    category_count: 0,
    series_count: 0,
    last_updated_at: "",
  }),
  categories: z.array(z.string()).default([]),
  series: z.array(z.string()).default([]),
  rows: z.array(ProductCategoryRowSchema).default([]),
  total: z.number().int().nonnegative().default(0),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().default(30),
}).loose();

export const EMPTY_PRODUCT_CATEGORY_LIST = {
  available: false,
  reason: "invalid_response",
  summary: {
    total: 0,
    mapped: 0,
    unmapped: 0,
    mixed: 0,
    category_count: 0,
    series_count: 0,
    last_updated_at: "",
  },
  categories: [] as string[],
  series: [] as string[],
  rows: [] as Array<typeof EMPTY_PRODUCT_CATEGORY_ROW>,
  total: 0,
  page: 1,
  page_size: 30,
};

export const ProductCategoryUpdateResponseSchema = z.object({
  success: z.boolean().default(false),
  row: ProductCategoryRowSchema.default(EMPTY_PRODUCT_CATEGORY_ROW),
  synced_records: z.number().int().nonnegative().default(0),
  synced_at: z.union([z.iso.datetime(), z.literal("")]).default(""),
}).loose();

export const EMPTY_PRODUCT_CATEGORY_UPDATE = {
  success: false,
  row: EMPTY_PRODUCT_CATEGORY_ROW,
  synced_records: 0,
  synced_at: "",
};

const SupplyFeeOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
}).loose();

export const SupplyFeeConfigSchema = z.object({
  available: z.boolean().default(false),
  can_manage: z.boolean().default(false),
  reason: z.string().default(""),
  source_kind: z.string().default(""),
  latest_run_no: z.string().default(""),
  latest_run_at: z.string().default(""),
  providers: z.array(SupplyFeeOptionSchema).default([]),
  warehouses: z.array(SupplyFeeOptionSchema).default([]),
  fee_types: z.array(SupplyFeeOptionSchema).default([]),
  statuses: z.array(SupplyFeeOptionSchema).default([]),
  reasons: z.array(SupplyFeeOptionSchema).default([]),
  missing_tables: z.array(z.string()).default([]),
  default_currency: z.string().default("CNY"),
  default_tolerance: z.number().nonnegative().default(0.01),
}).loose();

export const EMPTY_SUPPLY_FEE_CONFIG = {
  available: false,
  can_manage: false,
  reason: "invalid_response",
  source_kind: "",
  latest_run_no: "",
  latest_run_at: "",
  providers: [] as Array<{ value: string; label: string }>,
  warehouses: [] as Array<{ value: string; label: string }>,
  fee_types: [] as Array<{ value: string; label: string }>,
  statuses: [] as Array<{ value: string; label: string }>,
  reasons: [] as Array<{ value: string; label: string }>,
  missing_tables: [] as string[],
  default_currency: "CNY",
  default_tolerance: 0.01,
};

export const SupplyFeeBillBatchSchema = z.object({
  id: z.string(),
  batch_no: z.string().default(""),
  provider_id: z.string().default(""),
  provider_name: z.string().default(""),
  billing_period_start: z.string().default(""),
  billing_period_end: z.string().default(""),
  invoice_no: z.string().default(""),
  source_file_name: z.string().default(""),
  source_file_size_bytes: z.number().int().nonnegative().default(0),
  import_duration_ms: z.number().int().nonnegative().default(0),
  currency_code: z.string().default("CNY"),
  declared_amount: z.number().default(0),
  parsed_amount: z.number().default(0),
  line_count: z.number().int().nonnegative().default(0),
  valid_line_count: z.number().int().nonnegative().default(0),
  invalid_line_count: z.number().int().nonnegative().default(0),
  status: z.string().default(""),
  error_summary: z.record(z.string(), z.number().int().nonnegative()).default({}),
  latest_run_id: z.string().default(""),
  latest_run_no: z.string().default(""),
  latest_run_status: z.string().default(""),
  imported_by: z.string().default(""),
  imported_at: z.string().default(""),
  reconciled_at: z.string().default(""),
}).loose();

export const EMPTY_SUPPLY_FEE_BILL_BATCH = {
  id: "",
  batch_no: "",
  provider_id: "",
  provider_name: "",
  billing_period_start: "",
  billing_period_end: "",
  invoice_no: "",
  source_file_name: "",
  source_file_size_bytes: 0,
  import_duration_ms: 0,
  currency_code: "CNY",
  declared_amount: 0,
  parsed_amount: 0,
  line_count: 0,
  valid_line_count: 0,
  invalid_line_count: 0,
  status: "invalid_response",
  error_summary: {} as Record<string, number>,
  latest_run_id: "",
  latest_run_no: "",
  latest_run_status: "",
  imported_by: "",
  imported_at: "",
  reconciled_at: "",
};

export const SupplyFeeBillBatchListSchema = z.object({
  rows: z.array(SupplyFeeBillBatchSchema).default([]),
  total: z.number().int().nonnegative().default(0),
  page: z.number().int().positive().default(1),
}).loose();

export const EMPTY_SUPPLY_FEE_BILL_BATCH_LIST = {
  rows: [] as Array<z.infer<typeof SupplyFeeBillBatchSchema>>,
  total: 0,
  page: 1,
};

const SupplyFeeInvalidBillLineSchema = z.object({
  line_no: z.number().int().positive(),
  provider_line_no: z.string().default(""),
  fee_type: z.string().default(""),
  order_no: z.string().default(""),
  logistics_no: z.string().default(""),
  sku_code: z.string().default(""),
  billed_amount: z.number().default(0),
  validation_errors: z.array(z.string()).default([]),
}).loose();

export const SupplyFeeBillBatchDetailSchema = z.object({
  batch: SupplyFeeBillBatchSchema,
  invalid_lines: z.array(SupplyFeeInvalidBillLineSchema).default([]),
}).loose();

export const EMPTY_SUPPLY_FEE_BILL_BATCH_DETAIL = {
  batch: EMPTY_SUPPLY_FEE_BILL_BATCH,
  invalid_lines: [] as Array<z.infer<typeof SupplyFeeInvalidBillLineSchema>>,
};

export const SupplyFeeReconRunSchema = z.object({
  id: z.string(),
  run_no: z.string().default(""),
  bill_batch_id: z.string().default(""),
  status: z.string().default(""),
  calculation_mode: z.string().default("erp_recorded_fee"),
  tolerance_amount: z.number().nonnegative().default(0.01),
  created_at: z.string().default(""),
}).loose();

export const EMPTY_SUPPLY_FEE_RECON_RUN = {
  id: "",
  run_no: "",
  bill_batch_id: "",
  status: "invalid_response",
  calculation_mode: "erp_recorded_fee",
  tolerance_amount: 0.01,
  created_at: "",
};

const SupplyFeeMetricsSchema = z.object({
  result_count: z.number().int().nonnegative().default(0),
  sku_count: z.number().int().nonnegative().default(0),
  matched_count: z.number().int().nonnegative().default(0),
  diff_count: z.number().int().nonnegative().default(0),
  only_bill_count: z.number().int().nonnegative().default(0),
  only_expected_count: z.number().int().nonnegative().default(0),
  invalid_data_count: z.number().int().nonnegative().default(0),
  billed_amount: z.number().default(0),
  expected_amount: z.number().default(0),
  diff_amount: z.number().default(0),
  absolute_diff_amount: z.number().nonnegative().default(0),
  matched_rate: z.number().default(0),
}).loose();

const EMPTY_SUPPLY_FEE_METRICS = {
  result_count: 0,
  sku_count: 0,
  matched_count: 0,
  diff_count: 0,
  only_bill_count: 0,
  only_expected_count: 0,
  invalid_data_count: 0,
  billed_amount: 0,
  expected_amount: 0,
  diff_amount: 0,
  absolute_diff_amount: 0,
  matched_rate: 0,
};

const SupplyFeeTrendPointSchema = z.object({
  date: z.string(),
  billed_amount: z.number().default(0),
  expected_amount: z.number().default(0),
  diff_amount: z.number().default(0),
  absolute_diff_amount: z.number().nonnegative().default(0),
}).loose();

const SupplyFeeBreakdownSchema = z.object({
  key: z.string(),
  label: z.string(),
  result_count: z.number().int().nonnegative().default(0),
  billed_amount: z.number().default(0),
  expected_amount: z.number().default(0),
  diff_amount: z.number().default(0),
  absolute_diff_amount: z.number().nonnegative().default(0),
}).loose();

const SupplyFeeReasonBreakdownSchema = z.object({
  reason_code: z.string(),
  result_count: z.number().int().nonnegative().default(0),
  absolute_diff_amount: z.number().nonnegative().default(0),
}).loose();

export const SupplyFeeResultRowSchema = z.object({
  result_id: z.string(),
  line_id: z.string(),
  charge_date: z.string().default(""),
  provider_id: z.string().default(""),
  provider_name: z.string().default(""),
  fee_type: z.string().default(""),
  warehouse_no: z.string().default(""),
  order_no: z.string().default(""),
  logistics_no: z.string().default(""),
  sku_code: z.string().default(""),
  sku_name: z.string().default(""),
  quantity: z.number().default(0),
  actual_weight_kg: z.number().optional(),
  volume_weight_kg: z.number().optional(),
  chargeable_weight_kg: z.number().optional(),
  provider_unit_price: z.number().optional(),
  contract_unit_price: z.number().optional(),
  billed_amount: z.number().default(0),
  expected_amount: z.number().default(0),
  diff_amount: z.number().default(0),
  diff_rate: z.number().optional(),
  result_status: z.string().default(""),
  reason_code: z.string().default(""),
  allocation_method: z.string().default(""),
  allocation_ratio: z.number().default(0),
  rounding_adjustment: z.number().default(0),
}).loose();

export const SupplyFeeDashboardSchema = z.object({
  latest_run_no: z.string().default(""),
  latest_run_at: z.string().default(""),
  metrics: SupplyFeeMetricsSchema.default(EMPTY_SUPPLY_FEE_METRICS),
  trend: z.array(SupplyFeeTrendPointSchema).default([]),
  fee_breakdown: z.array(SupplyFeeBreakdownSchema).default([]),
  provider_ranking: z.array(SupplyFeeBreakdownSchema).default([]),
  warehouse_ranking: z.array(SupplyFeeBreakdownSchema).default([]),
  reason_breakdown: z.array(SupplyFeeReasonBreakdownSchema).default([]),
  top_exceptions: z.array(SupplyFeeResultRowSchema).default([]),
}).loose();

export const EMPTY_SUPPLY_FEE_DASHBOARD = {
  latest_run_no: "",
  latest_run_at: "",
  metrics: EMPTY_SUPPLY_FEE_METRICS,
  trend: [] as Array<z.infer<typeof SupplyFeeTrendPointSchema>>,
  fee_breakdown: [] as Array<z.infer<typeof SupplyFeeBreakdownSchema>>,
  provider_ranking: [] as Array<z.infer<typeof SupplyFeeBreakdownSchema>>,
  warehouse_ranking: [] as Array<z.infer<typeof SupplyFeeBreakdownSchema>>,
  reason_breakdown: [] as Array<z.infer<typeof SupplyFeeReasonBreakdownSchema>>,
  top_exceptions: [] as Array<z.infer<typeof SupplyFeeResultRowSchema>>,
};

export const SupplyFeeResultSearchSchema = z.object({
  rows: z.array(SupplyFeeResultRowSchema).default([]),
  total: z.number().int().nonnegative().default(0),
  page: z.number().int().positive().default(1),
}).loose();

export const EMPTY_SUPPLY_FEE_RESULT_SEARCH = {
  rows: [] as Array<z.infer<typeof SupplyFeeResultRowSchema>>,
  total: 0,
  page: 1,
};

const SupplyFeeResultHeaderSchema = z.object({
  id: z.string(),
  run_no: z.string().default(""),
  batch_no: z.string().default(""),
  provider_name: z.string().default(""),
  match_key: z.string().default(""),
  match_level: z.string().default(""),
  fee_type: z.string().default(""),
  charge_date: z.string().default(""),
  warehouse_no: z.string().default(""),
  order_no: z.string().default(""),
  logistics_no: z.string().default(""),
  billed_amount: z.number().default(0),
  expected_amount: z.number().default(0),
  diff_amount: z.number().default(0),
  absolute_diff_amount: z.number().nonnegative().default(0),
  diff_rate: z.number().optional(),
  result_status: z.string().default(""),
  reason_code: z.string().default(""),
  reason_detail: z.string().default(""),
  sku_count: z.number().int().nonnegative().default(0),
  allocation_method: z.string().default(""),
}).loose();

const SupplyFeeEvidenceSchema = z.object({
  line_id: z.string(),
  bill_line_id: z.string().default(""),
  expected_charge_id: z.string().default(""),
  raw_bill: z.record(z.string(), z.unknown()).default({}),
  formula: z.record(z.string(), z.unknown()).default({}),
  rate_rule_code: z.string().default(""),
  pricing_model: z.string().default(""),
}).loose();

const EMPTY_SUPPLY_FEE_RESULT_HEADER = {
  id: "",
  run_no: "",
  batch_no: "",
  provider_name: "",
  match_key: "",
  match_level: "",
  fee_type: "",
  charge_date: "",
  warehouse_no: "",
  order_no: "",
  logistics_no: "",
  billed_amount: 0,
  expected_amount: 0,
  diff_amount: 0,
  absolute_diff_amount: 0,
  result_status: "",
  reason_code: "invalid_response",
  reason_detail: "",
  sku_count: 0,
  allocation_method: "",
};

export const SupplyFeeResultDetailSchema = z.object({
  result: SupplyFeeResultHeaderSchema,
  lines: z.array(SupplyFeeResultRowSchema).default([]),
  evidence: z.array(SupplyFeeEvidenceSchema).default([]),
}).loose();

export const EMPTY_SUPPLY_FEE_RESULT_DETAIL = {
  result: EMPTY_SUPPLY_FEE_RESULT_HEADER,
  lines: [] as Array<z.infer<typeof SupplyFeeResultRowSchema>>,
  evidence: [] as Array<z.infer<typeof SupplyFeeEvidenceSchema>>,
};
