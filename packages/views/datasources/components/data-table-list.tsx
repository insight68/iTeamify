"use client";

import type { DataTableResponse } from "@teamify/core/types";

export function DataTableList({ tables }: { tables: DataTableResponse[] }) {
  const rows = Array.isArray(tables) ? tables : [];

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        这个数据源下还没有数据表
      </div>
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {rows.map((table) => (
        <div key={table.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {table.schema_name ? `${table.schema_name}.${table.name}` : table.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {table.description || table.id}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{table.updated_at}</span>
        </div>
      ))}
    </div>
  );
}
