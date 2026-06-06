"use client";

import { useQuery } from "@tanstack/react-query";
import { dataTableListOptions } from "@teamify/core/datasources/queries";
import { useWorkspaceId } from "@teamify/core/hooks";
import type { DataSourceResponse } from "@teamify/core/types";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { DataTableCreateDialog } from "./data-table-create-dialog";
import { DataTableList } from "./data-table-list";

export function DataSourceDetail({ dataSource }: { dataSource: DataSourceResponse | null }) {
  const wsId = useWorkspaceId();
  const { data: tables = [], isLoading } = useQuery({
    ...dataTableListOptions(wsId, dataSource?.id ?? ""),
    enabled: !!dataSource,
  });

  if (!dataSource) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        选择左侧数据源查看详情
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{dataSource.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {dataSource.description || "暂无描述"}
          </p>
        </div>
        <Badge variant="secondary">{dataSource.type}</Badge>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">数据表</h3>
          <DataTableCreateDialog dataSourceId={dataSource.id} />
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : (
          <DataTableList tables={tables} />
        )}
      </div>
    </div>
  );
}
