import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { OrgTreeNode } from "../types";

function normalizeOrgTree(nodes: OrgTreeNode[] | null | undefined): OrgTreeNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => ({
    ...node,
    children: normalizeOrgTree(node.children),
  }));
}

export const orgKeys = {
  all: (wsId: string) => ["org", wsId] as const,
  list: (wsId: string) => [...orgKeys.all(wsId), "list"] as const,
  tree: (wsId: string) => [...orgKeys.all(wsId), "tree"] as const,
  detail: (wsId: string, id: string) =>
    [...orgKeys.all(wsId), "detail", id] as const,
  permissions: (wsId: string, id: string) =>
    [...orgKeys.all(wsId), "permissions", id] as const,
};

export function orgUnitListOptions(wsId: string) {
  return queryOptions({
    queryKey: orgKeys.list(wsId),
    queryFn: () => api.listOrgUnits(),
    select: (data) => data.org_units ?? [],
  });
}

export function orgTreeOptions(wsId: string) {
  return queryOptions({
    queryKey: orgKeys.tree(wsId),
    queryFn: () => api.getOrgTree(),
    select: (data) => normalizeOrgTree(data.org_units),
  });
}

export function orgUnitDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: orgKeys.detail(wsId, id),
    queryFn: () => api.getOrgUnit(id),
  });
}

export function orgUnitPermissionsOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: orgKeys.permissions(wsId, id),
    queryFn: () => api.listOrgUnitPermissions(id),
    select: (data) => (Array.isArray(data.permissions) ? data.permissions : []),
  });
}
