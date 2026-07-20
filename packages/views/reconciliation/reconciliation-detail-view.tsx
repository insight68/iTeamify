"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  workspaceReconciliationConfigOptions,
  workspaceReconciliationDetailsOptions,
} from "@teamify/core/reconciliation";
import { Button } from "@teamify/ui/components/ui/button";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { cn } from "@teamify/ui/lib/utils";
import { ReconciliationDetailPanel } from "./components/reconciliation-detail-panel";

interface ReconciliationDetailViewProps {
  batchNo: string;
  onBack?: () => void;
  backLabel?: string;
  headerAction?: ReactNode;
  className?: string;
}

/**
 * Shared workspace reconciliation detail experience.
 *
 * Used by both the standalone detail route and the embedded chat module so
 * pagination, loading state, and detail data fetching stay in one place.
 */
export function ReconciliationDetailView({
  batchNo,
  onBack,
  backLabel = "对账",
  headerAction,
  className,
}: ReconciliationDetailViewProps) {
  const wsId = useWorkspaceId();
  const [page, setPage] = useState(1);

  const { data: config, isLoading: configLoading } = useQuery(
    workspaceReconciliationConfigOptions(wsId),
  );

  const detailOptions = workspaceReconciliationDetailsOptions(wsId, {
    batchNo,
    page,
  });
  const { data, isLoading, refetch } = useQuery({
    ...detailOptions,
    enabled: !!wsId && !!batchNo && !configLoading,
  });

  if (configLoading) {
    return (
      <div className={cn("flex h-full w-full min-h-0 min-w-0 flex-col gap-4", className)}>
        {headerAction ? (
          <div className="flex shrink-0 items-center justify-end">
            {headerAction}
          </div>
        ) : null}
        <Skeleton className="h-8 w-48" />
        <Skeleton className="min-h-0 flex-1 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full w-full min-h-0 min-w-0 flex-col gap-3", className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          ) : (
            <span className="font-medium">{backLabel}</span>
          )}
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-mono text-xs">{batchNo}</span>
        </div>
        {headerAction ? (
          <div className="flex shrink-0 items-center">{headerAction}</div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <ReconciliationDetailPanel
          batchNo={batchNo}
          data={data}
          isLoading={isLoading}
          onRefresh={() => refetch()}
          page={page}
          onPageChange={setPage}
          detailColumns={config?.detail_columns ?? []}
        />
      </div>
    </div>
  );
}
