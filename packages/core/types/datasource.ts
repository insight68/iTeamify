import type { PermissionLevel } from "./org";

export type DataSourceType = "database" | "api" | "file";

export interface DataSource {
  id: string;
  workspace_id: string;
  name: string;
  type: DataSourceType;
  config: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** JSON shape returned by data source APIs. Mirrors Go DataSourceResponse. */
export type DataSourceResponse = DataSource;

export interface CreateDataSourceRequest {
  name: string;
  type: DataSourceType;
  config?: Record<string, unknown>;
  description?: string;
}

export interface UpdateDataSourceRequest {
  name?: string;
  type?: DataSourceType;
  config?: Record<string, unknown>;
  description?: string | null;
}

export interface DataTable {
  id: string;
  data_source_id: string;
  name: string;
  schema_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** JSON shape returned by data table APIs. Mirrors Go DataTableResponse. */
export type DataTableResponse = DataTable;

/** Request body for POST /api/data-sources/{dataSourceId}/tables.
 *  Note: data_source_id comes from the URL param, not the body. */
export interface CreateDataTableRequest {
  name: string;
  schema_name?: string;
  description?: string;
}

export interface UpdateDataTableRequest {
  name?: string;
  schema_name?: string | null;
  description?: string | null;
}

/**
 * Re-exported from org.ts for datasource-domain consumers.
 * Mirrors Go OrgUnitPermissionResponse: a permission entry with
 * denormalized table_name and data_source_id for display.
 */
export type OrgPermission = import("./org").OrgPermission;

export { type PermissionLevel };

/**
 * Workspace-wide flat permission entry returned by GET /api/permissions.
 * Mirrors Go AllPermissionsResponse.
 */
export interface AllPermissionsResponse {
  org_unit_id: string;
  data_table_id: string;
  permission_level: PermissionLevel;
  org_unit_name: string;
  org_unit_type: string;
  table_name: string;
  data_source_id: string;
  data_source_name: string;
}
