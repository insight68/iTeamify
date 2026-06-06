"use client";

import { Badge } from "@teamify/ui/components/ui/badge";
import { Button } from "@teamify/ui/components/ui/button";
import { Database, FileText, Globe2 } from "lucide-react";
import type { DataSourceResponse } from "@teamify/core/types";
import { cn } from "@teamify/ui/lib/utils";

export function DataSourceCard({
  dataSource,
  selected,
  onSelect,
}: {
  dataSource: DataSourceResponse;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = dataSource.type === "api" ? Globe2 : dataSource.type === "file" ? FileText : Database;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start rounded-md border p-3 text-left hover:bg-accent/50",
        selected && "border-primary bg-accent",
      )}
    >
      <div className="flex w-full items-start gap-3">
        <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{dataSource.name}</span>
          <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
            {dataSource.description || "暂无描述"}
          </span>
        </span>
        <Badge variant="secondary">{dataSource.type}</Badge>
      </div>
    </Button>
  );
}
