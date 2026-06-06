import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const dataSourceKeys = {
  all: (wsId: string) => ["data-sources", wsId] as const,
  list: (wsId: string) => [...dataSourceKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) =>
    [...dataSourceKeys.all(wsId), "detail", id] as const,
  tables: (wsId: string, dataSourceId: string) =>
    [...dataSourceKeys.all(wsId), "tables", dataSourceId] as const,
  table: (wsId: string, tableId: string) =>
    [...dataSourceKeys.all(wsId), "table", tableId] as const,
  permissions: (wsId: string) => ["permissions", wsId] as const,
};

export function dataSourceListOptions(wsId: string) {
  return queryOptions({
    queryKey: dataSourceKeys.list(wsId),
    queryFn: () => api.listDataSources(),
    select: (data) => (Array.isArray(data.data_sources) ? data.data_sources : []),
  });
}

export function dataSourceDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: dataSourceKeys.detail(wsId, id),
    queryFn: () => api.getDataSource(id),
  });
}

export function dataTableListOptions(wsId: string, dataSourceId: string) {
  return queryOptions({
    queryKey: dataSourceKeys.tables(wsId, dataSourceId),
    queryFn: () => api.listDataTables(dataSourceId),
    select: (data) => (Array.isArray(data.data_tables) ? data.data_tables : []),
  });
}

export function dataTableDetailOptions(wsId: string, tableId: string) {
  return queryOptions({
    queryKey: dataSourceKeys.table(wsId, tableId),
    queryFn: () => api.getDataTable(tableId),
  });
}

export function allPermissionsOptions(wsId: string) {
  return queryOptions({
    queryKey: dataSourceKeys.permissions(wsId),
    queryFn: () => api.listAllPermissions(),
    select: (data) => (Array.isArray(data.permissions) ? data.permissions : []),
  });
}
