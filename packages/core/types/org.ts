export type OrgUnitType = "company" | "department" | "team";

export interface OrgUnit {
  id: string;
  workspace_id: string;
  name: string;
  type: OrgUnitType;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** JSON shape returned by org unit CRUD APIs. Mirrors Go OrgUnitResponse. */
export interface OrgUnitResponse extends OrgUnit {
  children?: OrgUnitResponse[];
}

export interface ListOrgUnitsResponse {
  org_units: OrgUnitResponse[];
  total: number;
}

/** Recursive tree node with children array, returned by GetOrgTree. */
export interface OrgTreeNode {
  id: string;
  workspace_id: string;
  name: string;
  type: OrgUnitType;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: OrgTreeNode[];
}

/** Wrapper for GET /api/org-units/tree response. */
export interface OrgTreeResponse {
  org_units: OrgTreeNode[];
  total: number;
}

export interface CreateOrgUnitRequest {
  name: string;
  type: OrgUnitType;
  parent_id?: string | null;
  description?: string;
  sort_order?: number;
}

export interface UpdateOrgUnitRequest {
  name?: string;
  type?: OrgUnitType;
  parent_id?: string | null;
  description?: string | null;
  sort_order?: number;
}

export type PermissionLevel = "read" | "write";

/** Mirrors Go OrgUnitPermissionResponse: a permission entry with denormalized
 *  table_name and data_source_id for display purposes. */
export interface OrgPermission {
  org_unit_id: string;
  data_table_id: string;
  permission_level: PermissionLevel;
  table_name: string;
  data_source_id: string;
}

/** Wrapper for GET /api/org-units/{id}/permissions response. */
export interface OrgPermissionsResponse {
  permissions: OrgPermission[];
  total: number;
}

/** Request body for PUT /api/org-units/{orgUnitId}/permissions. */
export interface SetOrgUnitPermissionsRequest {
  permissions: SetOrgUnitPermissionItem[];
}

export interface SetOrgUnitPermissionItem {
  data_table_id: string;
  permission_level: PermissionLevel;
}
