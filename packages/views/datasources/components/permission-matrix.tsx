"use client";

import { useQuery } from "@tanstack/react-query";
import { allPermissionsOptions } from "@teamify/core/datasources/queries";
import { useWorkspaceId } from "@teamify/core/hooks";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { useT } from "../../i18n";

export function PermissionMatrix() {
  const { t } = useT("datasources");
  const wsId = useWorkspaceId();
  const { data: permissions = [], isLoading } = useQuery(allPermissionsOptions(wsId));

  if (isLoading) {
    return <Skeleton className="h-28 w-full" />;
  }

  if (permissions.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {t(($) => $.matrix.empty)}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[1.1fr_1fr_1fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>{t(($) => $.matrix.columns.org_unit)}</span>
        <span>{t(($) => $.matrix.columns.data_source)}</span>
        <span>{t(($) => $.matrix.columns.data_table)}</span>
        <span>{t(($) => $.matrix.columns.permission)}</span>
      </div>
      <div className="divide-y">
        {permissions.map((permission) => (
          <div
            key={`${permission.org_unit_id}:${permission.data_table_id}:${permission.permission_level}`}
            className="grid grid-cols-[1.1fr_1fr_1fr_auto] gap-3 px-3 py-2 text-sm"
          >
            <span className="truncate">{permission.org_unit_name}</span>
            <span className="truncate text-muted-foreground">{permission.data_source_name}</span>
            <span className="truncate text-muted-foreground">{permission.table_name}</span>
            <Badge variant={permission.permission_level === "write" ? "default" : "secondary"}>
              {permission.permission_level}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
