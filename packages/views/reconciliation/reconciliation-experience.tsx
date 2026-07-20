"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useWorkspaceId } from "@teamify/core/hooks";
import {
  workspaceReconciliationConfigOptions,
  workspaceReconciliationSummaryOptions,
} from "@teamify/core/reconciliation";
import type { ChatTableColumn, ChatTableFilter } from "@teamify/core/types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@teamify/ui/components/ui/empty";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { cn } from "@teamify/ui/lib/utils";
import { ReconciliationSummaryPanel } from "./components/reconciliation-summary-panel";
import { ReconciliationDetailView } from "./reconciliation-detail-view";
import { useT } from "../i18n";

type ReconciliationSurface = "route" | "embedded";
type ReconciliationDetailMode = "route" | "inline";

interface ReconciliationExperienceProps {
  surface?: ReconciliationSurface;
  detailMode?: ReconciliationDetailMode;
  titleOverride?: string;
  headerAction?: ReactNode;
  className?: string;
}

/**
 * Shared workspace reconciliation experience.
 *
 * Standalone routes and embedded chat modules both render this component so
 * query keys, pagination, confirmation, export, and detail loading do not
 * drift into parallel implementations.
 */
export function ReconciliationExperience({
  surface = "route",
  detailMode = "route",
  titleOverride,
  headerAction,
  className,
}: ReconciliationExperienceProps) {
  const wsId = useWorkspaceId();
  const { t } = useT("agents");
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [page, setPage] = useState(1);
  const [activeBatchNo, setActiveBatchNo] = useState<string | null>(null);

  const { data: config, isLoading: configLoading } = useQuery(
    workspaceReconciliationConfigOptions(wsId),
  );

  const columns = useMemo(
    () => (config?.columns ?? []) as ChatTableColumn[],
    [config?.columns],
  );
  const filterConfigs = useMemo(
    () => (config?.filters ?? []) as ChatTableFilter[],
    [config?.filters],
  );
  const pageSize = config?.page_size && config.page_size > 0
    ? config.page_size
    : 20;
  const hasColumns = columns.length > 0;

  const summaryOptions = workspaceReconciliationSummaryOptions(wsId, {
    filters,
    page,
    pageSize,
  });
  const { data, isLoading, refetch } = useQuery({
    ...summaryOptions,
    enabled: !!wsId && !configLoading && hasColumns,
  });

  const handleFiltersChange = useCallback((next: Record<string, unknown>) => {
    setFilters(next);
  }, []);

  const handleBatchOpen = useCallback((batchNo: string) => {
    if (detailMode === "inline") {
      setActiveBatchNo(batchNo);
    }
  }, [detailMode]);

  const handleBackToSummary = useCallback(() => {
    setActiveBatchNo(null);
  }, []);

  const rootClassName = cn(
    "flex h-full w-full min-h-0 min-w-0 flex-1 flex-col",
    surface === "route" ? "p-4" : "p-0",
    className,
  );

  if (configLoading) {
    return (
      <div className={cn(rootClassName, "gap-4")}>
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

  if (!hasColumns) {
    return (
      <div className={cn(rootClassName, "gap-2")}>
        {headerAction ? (
          <div className="flex shrink-0 items-center justify-end">
            {headerAction}
          </div>
        ) : null}
        <Empty className="min-h-0 flex-1 rounded-lg border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 className="h-4 w-4" />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.tab_body.reconciliation.empty_title)}</EmptyTitle>
            <EmptyDescription>
              {t(($) => $.tab_body.reconciliation.empty_description)}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (detailMode === "inline" && activeBatchNo) {
    return (
      <div className={rootClassName}>
        <ReconciliationDetailView
          batchNo={activeBatchNo}
          onBack={handleBackToSummary}
          backLabel={t(($) => $.tab_body.reconciliation.default_title)}
          headerAction={headerAction}
        />
      </div>
    );
  }

  return (
    <div className={rootClassName}>
      <ReconciliationSummaryPanel
        columns={columns}
        filters={filterConfigs}
        batchNoColumn={config?.batch_no_column ?? "batch_no"}
        data={data}
        isLoading={isLoading}
        onRefresh={() => refetch()}
        onFiltersChange={handleFiltersChange}
        onPageChange={setPage}
        page={page}
        pageSize={pageSize}
        wsId={wsId}
        title={titleOverride || t(($) => $.tab_body.reconciliation.default_title)}
        onBatchOpen={detailMode === "inline" ? handleBatchOpen : undefined}
        headerAction={headerAction}
      />
    </div>
  );
}
