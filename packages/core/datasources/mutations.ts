import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type {
  CreateDataSourceRequest,
  CreateDataTableRequest,
  DataSourceResponse,
  DataTableResponse,
  UpdateDataSourceRequest,
  UpdateDataTableRequest,
} from "../types";
import { dataSourceKeys } from "./queries";

interface ListDataSourcesResponse {
  data_sources: DataSourceResponse[];
  total: number;
}

interface ListDataTablesResponse {
  data_tables: DataTableResponse[];
  total: number;
}

export function useCreateDataSource() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (data: CreateDataSourceRequest) => api.createDataSource(data),
    onSuccess: (newDataSource) => {
      qc.setQueryData<ListDataSourcesResponse>(dataSourceKeys.list(wsId), (old) =>
        old && !old.data_sources.some((source) => source.id === newDataSource.id)
          ? {
              ...old,
              data_sources: [...old.data_sources, newDataSource],
              total: old.total + 1,
            }
          : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dataSourceKeys.list(wsId) });
    },
  });
}

export function useUpdateDataSource() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateDataSourceRequest) =>
      api.updateDataSource(id, data),
    onMutate: async ({ id, ...data }) => {
      await qc.cancelQueries({ queryKey: dataSourceKeys.list(wsId) });
      await qc.cancelQueries({ queryKey: dataSourceKeys.detail(wsId, id) });

      const prevList = qc.getQueryData<ListDataSourcesResponse>(dataSourceKeys.list(wsId));
      const prevDetail = qc.getQueryData<DataSourceResponse>(dataSourceKeys.detail(wsId, id));

      qc.setQueryData<ListDataSourcesResponse>(dataSourceKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              data_sources: old.data_sources.map((source) =>
                source.id === id ? { ...source, ...data } : source,
              ),
            }
          : old,
      );
      qc.setQueryData<DataSourceResponse>(dataSourceKeys.detail(wsId, id), (old) =>
        old ? { ...old, ...data } : old,
      );

      return { id, prevDetail, prevList };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList) qc.setQueryData(dataSourceKeys.list(wsId), ctx.prevList);
      if (ctx?.prevDetail) {
        qc.setQueryData(dataSourceKeys.detail(wsId, ctx.id), ctx.prevDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: dataSourceKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.permissions(wsId) });
    },
  });
}

export function useDeleteDataSource() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (id: string) => api.deleteDataSource(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: dataSourceKeys.list(wsId) });
      const prevList = qc.getQueryData<ListDataSourcesResponse>(dataSourceKeys.list(wsId));

      qc.setQueryData<ListDataSourcesResponse>(dataSourceKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              data_sources: old.data_sources.filter((source) => source.id !== id),
              total: Math.max(0, old.total - 1),
            }
          : old,
      );
      qc.removeQueries({ queryKey: dataSourceKeys.detail(wsId, id) });

      return { prevList };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(dataSourceKeys.list(wsId), ctx.prevList);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dataSourceKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.permissions(wsId) });
    },
  });
}

export function useCreateDataTable() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ dataSourceId, ...data }: { dataSourceId: string } & CreateDataTableRequest) =>
      api.createDataTable(dataSourceId, data),
    onSuccess: (newTable, vars) => {
      qc.setQueryData<ListDataTablesResponse>(
        dataSourceKeys.tables(wsId, vars.dataSourceId),
        (old) =>
          old && !old.data_tables.some((table) => table.id === newTable.id)
            ? {
                ...old,
                data_tables: [...old.data_tables, newTable],
                total: old.total + 1,
              }
            : old,
      );
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: dataSourceKeys.tables(wsId, vars.dataSourceId) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.permissions(wsId) });
    },
  });
}

export function useUpdateDataTable() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateDataTableRequest) =>
      api.updateDataTable(id, data),
    onMutate: async ({ id, ...data }) => {
      await qc.cancelQueries({ queryKey: dataSourceKeys.table(wsId, id) });
      const prevTable = qc.getQueryData<DataTableResponse>(dataSourceKeys.table(wsId, id));

      qc.setQueryData<DataTableResponse>(dataSourceKeys.table(wsId, id), (old) =>
        old ? { ...old, ...data } : old,
      );

      return { id, prevTable };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevTable) {
        qc.setQueryData(dataSourceKeys.table(wsId, ctx.id), ctx.prevTable);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: dataSourceKeys.table(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.permissions(wsId) });
    },
  });
}

export function useDeleteDataTable() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ id }: { id: string; dataSourceId?: string }) => api.deleteDataTable(id),
    onSuccess: (_data, { id }) => {
      qc.removeQueries({ queryKey: dataSourceKeys.table(wsId, id) });
    },
    onSettled: (_data, _err, vars) => {
      if (vars.dataSourceId) {
        qc.invalidateQueries({
          queryKey: dataSourceKeys.tables(wsId, vars.dataSourceId),
        });
      }
      qc.invalidateQueries({ queryKey: dataSourceKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: dataSourceKeys.permissions(wsId) });
    },
  });
}
