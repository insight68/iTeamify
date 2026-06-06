"use client";

import { useQuery } from "@tanstack/react-query";
import { allPermissionsOptions } from "@teamify/core/datasources/queries";
import { useWorkspaceId } from "@teamify/core/hooks";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";

export function PermissionMatrix() {
  const wsId = useWorkspaceId();
  const { data: permissions = [], isLoading } = useQuery(allPermissionsOptions(wsId));

  if (isLoading) {
    return <Skeleton className="h-28 w-full" />;
  }

  if (permissions.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        暂无权限矩阵数据
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[1.1fr_1fr_1fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>组织节点</span>
        <span>数据源</span>
        <span>数据表</span>
        <span>权限</span>
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
