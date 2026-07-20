export interface SupplyFeeOption {
  value: string;
  label: string;
}

export interface SupplyFeeConfig {
  available: boolean;
  can_manage: boolean;
  reason: string;
  source_kind: string;
  latest_run_no: string;
  latest_run_at: string;
  providers: SupplyFeeOption[];
  warehouses: SupplyFeeOption[];
  fee_types: SupplyFeeOption[];
  statuses: SupplyFeeOption[];
  reasons: SupplyFeeOption[];
  missing_tables: string[];
  default_currency: string;
  default_tolerance: number;
}

export interface SupplyFeeBillBatch {
  id: string;
  batch_no: string;
  provider_id: string;
  provider_name: string;
  billing_period_start: string;
  billing_period_end: string;
  invoice_no: string;
  source_file_name: string;
  source_file_size_bytes: number;
  import_duration_ms: number;
  currency_code: string;
  declared_amount: number;
  parsed_amount: number;
  line_count: number;
  valid_line_count: number;
  invalid_line_count: number;
  status: string;
  error_summary: Record<string, number>;
  latest_run_id: string;
  latest_run_no: string;
  latest_run_status: string;
  imported_by: string;
  imported_at: string;
  reconciled_at: string;
}

export interface SupplyFeeBillBatchList {
  rows: SupplyFeeBillBatch[];
  total: number;
  page: number;
}

export interface SupplyFeeInvalidBillLine {
  line_no: number;
  provider_line_no: string;
  fee_type: string;
  order_no: string;
  logistics_no: string;
  sku_code: string;
  billed_amount: number;
  validation_errors: string[];
}

export interface SupplyFeeBillBatchDetail {
  batch: SupplyFeeBillBatch;
  invalid_lines: SupplyFeeInvalidBillLine[];
}

export interface SupplyFeeBillImportInput {
  file: File;
  provider_id?: string;
  provider_code?: string;
  provider_name?: string;
  provider_type?: "carrier" | "warehouse" | "3pl";
  billing_period_start: string;
  billing_period_end: string;
  invoice_no?: string;
  currency_code?: string;
  declared_amount?: number;
}

export interface SupplyFeeReconRun {
  id: string;
  run_no: string;
  bill_batch_id: string;
  status: string;
  calculation_mode: string;
  tolerance_amount: number;
  created_at: string;
}

export interface SupplyFeeFilters {
  date_from?: string;
  date_to?: string;
  provider_id?: string;
  warehouse_no?: string;
  fee_type?: string;
  result_status?: string;
  reason_code?: string;
  sku?: string;
  order_no?: string;
  logistics_no?: string;
}

export interface SupplyFeeMetrics {
  result_count: number;
  sku_count: number;
  matched_count: number;
  diff_count: number;
  only_bill_count: number;
  only_expected_count: number;
  invalid_data_count: number;
  billed_amount: number;
  expected_amount: number;
  diff_amount: number;
  absolute_diff_amount: number;
  matched_rate: number;
}

export interface SupplyFeeTrendPoint {
  date: string;
  billed_amount: number;
  expected_amount: number;
  diff_amount: number;
  absolute_diff_amount: number;
}

export interface SupplyFeeBreakdown {
  key: string;
  label: string;
  result_count: number;
  billed_amount: number;
  expected_amount: number;
  diff_amount: number;
  absolute_diff_amount: number;
}

export interface SupplyFeeReasonBreakdown {
  reason_code: string;
  result_count: number;
  absolute_diff_amount: number;
}

export interface SupplyFeeResultRow {
  result_id: string;
  line_id: string;
  charge_date: string;
  provider_id: string;
  provider_name: string;
  fee_type: string;
  warehouse_no: string;
  order_no: string;
  logistics_no: string;
  sku_code: string;
  sku_name: string;
  quantity: number;
  actual_weight_kg?: number;
  volume_weight_kg?: number;
  chargeable_weight_kg?: number;
  provider_unit_price?: number;
  contract_unit_price?: number;
  billed_amount: number;
  expected_amount: number;
  diff_amount: number;
  diff_rate?: number;
  result_status: string;
  reason_code: string;
  allocation_method: string;
  allocation_ratio: number;
  rounding_adjustment: number;
}

export interface SupplyFeeDashboard {
  latest_run_no: string;
  latest_run_at: string;
  metrics: SupplyFeeMetrics;
  trend: SupplyFeeTrendPoint[];
  fee_breakdown: SupplyFeeBreakdown[];
  provider_ranking: SupplyFeeBreakdown[];
  warehouse_ranking: SupplyFeeBreakdown[];
  reason_breakdown: SupplyFeeReasonBreakdown[];
  top_exceptions: SupplyFeeResultRow[];
}

export interface SupplyFeeResultSearch {
  rows: SupplyFeeResultRow[];
  total: number;
  page: number;
}

export interface SupplyFeeResultHeader {
  id: string;
  run_no: string;
  batch_no: string;
  provider_name: string;
  match_key: string;
  match_level: string;
  fee_type: string;
  charge_date: string;
  warehouse_no: string;
  order_no: string;
  logistics_no: string;
  billed_amount: number;
  expected_amount: number;
  diff_amount: number;
  absolute_diff_amount: number;
  diff_rate?: number;
  result_status: string;
  reason_code: string;
  reason_detail: string;
  sku_count: number;
  allocation_method: string;
}

export interface SupplyFeeResultEvidence {
  line_id: string;
  bill_line_id: string;
  expected_charge_id: string;
  raw_bill: Record<string, unknown>;
  formula: Record<string, unknown>;
  rate_rule_code: string;
  pricing_model: string;
}

export interface SupplyFeeResultDetail {
  result: SupplyFeeResultHeader;
  lines: SupplyFeeResultRow[];
  evidence: SupplyFeeResultEvidence[];
}

export type SupplyFeeSortBy = "charge_date" | "diff_amount" | "billed_amount" | "expected_amount" | "sku_code";
export type SupplyFeeSortDir = "asc" | "desc";
