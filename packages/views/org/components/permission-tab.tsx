"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { dataSourceListOptions, dataTableListOptions } from "@teamify/core/datasources/queries";
import { orgUnitPermissionsOptions } from "@teamify/core/org/queries";
import { useSetOrgUnitPermissions } from "@teamify/core/org/mutations";
import { useWorkspaceId } from "@teamify/core/hooks";
import type {
  DataSourceResponse,
  DataTableResponse,
  OrgPermission,
  PermissionLevel,
} from "@teamify/core/types";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@teamify/ui/components/ui/native-select";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { toast } from "sonner";
import { useT } from "../../i18n";

type PermissionChoice = PermissionLevel | "none";

interface TablePermissionRow {
  dataSource: DataSourceResponse;
  table: DataTableResponse;
}

const EMPTY_DATA_SOURCES: DataSourceResponse[] = [];
const EMPTY_PERMISSIONS: OrgPermission[] = [];

export function PermissionTab({ orgUnitId }: { orgUnitId: string }) {
  const { t } = useT("org");
  const wsId = useWorkspaceId();
  const setPermissions = useSetOrgUnitPermissions();
  const [levels, setLevels] = useState<Record<string, PermissionChoice>>({});

  const { data: permissions = EMPTY_PERMISSIONS, isLoading } = useQuery(
    orgUnitPermissionsOptions(wsId, orgUnitId),
  );
  const { data: dataSources = EMPTY_DATA_SOURCES, isLoading: dataSourcesLoading } = useQuery(
    dataSourceListOptions(wsId),
  );
  const tableQueries = useQueries({
    queries: dataSources.map((source) => dataTableListOptions(wsId, source.id)),
  });

  const rows = useMemo<TablePermissionRow[]>(
    () =>
      dataSources.flatMap((dataSource, index) => {
        const tables = tableQueries[index]?.data ?? [];
        return tables.map((table) => ({ dataSource, table }));
      }),
    [dataSources, tableQueries],
  );
  const tableQueriesLoading = tableQueries.some((query) => query.isLoading);
  const tableQueriesFetching = tableQueries.some((query) => query.isFetching);
  const loading = isLoading || dataSourcesLoading || tableQueriesLoading;

  const savedLevels = useMemo(() => {
    const next: Record<string, PermissionChoice> = {};
    for (const permission of permissions) {
      next[permission.data_table_id] = permission.permission_level;
    }
    return next;
  }, [permissions]);

  useEffect(() => {
    setLevels(savedLevels);
  }, [orgUnitId, savedLevels]);

  const currentLevel = (tableId: string): PermissionChoice => levels[tableId] ?? "none";
  const isDirty = useMemo(() => {
    const tableIds = new Set([
      ...Object.keys(savedLevels),
      ...Object.keys(levels),
      ...rows.map((row) => row.table.id),
    ]);
    for (const tableId of tableIds) {
      if ((savedLevels[tableId] ?? "none") !== (levels[tableId] ?? "none")) return true;
    }
    return false;
  }, [levels, rows, savedLevels]);

  const updateLevel = (tableId: string, level: PermissionChoice) => {
    setLevels((current) => {
      const next = { ...current };
      if (level === "none") {
        delete next[tableId];
      } else {
        next[tableId] = level;
      }
      return next;
    });
  };

  const save = () => {
    setPermissions.mutate(
      {
        orgUnitId,
        permissions: Object.entries(levels)
          .filter((entry): entry is [string, PermissionLevel] => entry[1] !== "none")
          .map(([data_table_id, permission_level]) => ({
            data_table_id,
            permission_level,
          })),
      },
      {
        onSuccess: () => toast.success(t(($) => $.permissions.toast_saved)),
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : t(($) => $.permissions.toast_save_failed),
          ),
      },
    );
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
      </div>
    );
  }

  if (dataSources.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {t(($) => $.permissions.empty_sources)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {t(($) => $.permissions.empty_tables)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{t(($) => $.permissions.editor_title)}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(($) => $.permissions.editor_description)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!isDirty || setPermissions.isPending || tableQueriesFetching}
        >
          {setPermissions.isPending ? t(($) => $.permissions.saving) : t(($) => $.permissions.save)}
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[1fr_1fr_150px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>{t(($) => $.permissions.columns.source)}</span>
          <span>{t(($) => $.permissions.columns.table)}</span>
          <span>{t(($) => $.permissions.columns.permission)}</span>
        </div>
        <div className="divide-y">
          {rows.map(({ dataSource, table }) => {
            const level = currentLevel(table.id);
            return (
              <div
                key={table.id}
                className="grid grid-cols-[1fr_1fr_150px] items-center gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{dataSource.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{dataSource.type}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {table.schema_name ? `${table.schema_name}.${table.name}` : table.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {table.description || table.id}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {level !== "none" ? (
                    <Badge variant={level === "write" ? "default" : "secondary"}>
                      {t(($) => $.permissions.levels[level])}
                    </Badge>
                  ) : null}
                  <NativeSelect
                    size="sm"
                    className="w-[104px]"
                    value={level}
                    onChange={(event) =>
                      updateLevel(table.id, event.target.value as PermissionChoice)
                    }
                    disabled={setPermissions.isPending}
                    aria-label={t(($) => $.permissions.permission_select_label, {
                      table: table.name,
                    })}
                  >
                    <NativeSelectOption value="none">
                      {t(($) => $.permissions.levels.none)}
                    </NativeSelectOption>
                    <NativeSelectOption value="read">
                      {t(($) => $.permissions.levels.read)}
                    </NativeSelectOption>
                    <NativeSelectOption value="write">
                      {t(($) => $.permissions.levels.write)}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!isDirty && permissions.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {t(($) => $.permissions.empty_permissions)}
        </div>
      ) : null}
    </div>
  );
}
