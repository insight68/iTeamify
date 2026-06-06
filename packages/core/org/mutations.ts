import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type {
  CreateOrgUnitRequest,
  ListOrgUnitsResponse,
  OrgPermissionsResponse,
  OrgUnitResponse,
  SetOrgUnitPermissionsRequest,
  UpdateOrgUnitRequest,
} from "../types";
import { orgKeys } from "./queries";

export function useCreateOrgUnit() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (data: CreateOrgUnitRequest) => api.createOrgUnit(data),
    onSuccess: (newUnit) => {
      qc.setQueryData<ListOrgUnitsResponse>(orgKeys.list(wsId), (old) =>
        old && !old.org_units.some((unit) => unit.id === newUnit.id)
          ? { ...old, org_units: [...old.org_units, newUnit], total: old.total + 1 }
          : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: orgKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: orgKeys.tree(wsId) });
    },
  });
}

export function useUpdateOrgUnit() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateOrgUnitRequest) =>
      api.updateOrgUnit(id, data),
    onMutate: async ({ id, ...data }) => {
      await qc.cancelQueries({ queryKey: orgKeys.list(wsId) });
      await qc.cancelQueries({ queryKey: orgKeys.detail(wsId, id) });

      const prevList = qc.getQueryData<ListOrgUnitsResponse>(orgKeys.list(wsId));
      const prevDetail = qc.getQueryData<OrgUnitResponse>(orgKeys.detail(wsId, id));

      qc.setQueryData<ListOrgUnitsResponse>(orgKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              org_units: old.org_units.map((unit) =>
                unit.id === id ? { ...unit, ...data } : unit,
              ),
            }
          : old,
      );
      qc.setQueryData<OrgUnitResponse>(orgKeys.detail(wsId, id), (old) =>
        old ? { ...old, ...data } : old,
      );

      return { id, prevDetail, prevList };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevList) qc.setQueryData(orgKeys.list(wsId), ctx.prevList);
      if (ctx?.prevDetail) qc.setQueryData(orgKeys.detail(wsId, ctx.id), ctx.prevDetail);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: orgKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: orgKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: orgKeys.tree(wsId) });
    },
  });
}

export function useDeleteOrgUnit() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (id: string) => api.deleteOrgUnit(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: orgKeys.list(wsId) });
      const prevList = qc.getQueryData<ListOrgUnitsResponse>(orgKeys.list(wsId));

      qc.setQueryData<ListOrgUnitsResponse>(orgKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              org_units: old.org_units.filter((unit) => unit.id !== id),
              total: Math.max(0, old.total - 1),
            }
          : old,
      );
      qc.removeQueries({ queryKey: orgKeys.detail(wsId, id) });
      qc.removeQueries({ queryKey: orgKeys.permissions(wsId, id) });

      return { prevList };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(orgKeys.list(wsId), ctx.prevList);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: orgKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: orgKeys.tree(wsId) });
      qc.invalidateQueries({ queryKey: orgKeys.all(wsId) });
    },
  });
}

export function useSetOrgUnitPermissions() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: ({ orgUnitId, ...data }: { orgUnitId: string } & SetOrgUnitPermissionsRequest) =>
      api.setOrgUnitPermissions(orgUnitId, data),
    onSuccess: (data, vars) => {
      qc.setQueryData<OrgPermissionsResponse>(
        orgKeys.permissions(wsId, vars.orgUnitId),
        data,
      );
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: orgKeys.permissions(wsId, vars.orgUnitId) });
      qc.invalidateQueries({ queryKey: ["permissions", wsId] });
    },
  });
}
