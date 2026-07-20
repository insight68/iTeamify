"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@teamify/core/hooks";
import { orgTreeOptions, orgUnitListOptions } from "@teamify/core/org/queries";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { PageHeader } from "../../layout/page-header";
import { useT } from "../../i18n";
import { OrgCreateDialog } from "./org-create-dialog";
import { OrgDetailPanel } from "./org-detail-panel";
import { OrgTreeView } from "./org-tree-view";

export function OrgPage() {
  const { t } = useT("org");
  const wsId = useWorkspaceId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: tree = [], isLoading: treeLoading } = useQuery(orgTreeOptions(wsId));
  const { data: orgUnits = [], isLoading: listLoading } = useQuery(orgUnitListOptions(wsId));
  const selected = useMemo(
    () => orgUnits.find((unit) => unit.id === selectedId) ?? orgUnits[0] ?? null,
    [orgUnits, selectedId],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader className="justify-between px-5">
        <div>
          <h1 className="text-sm font-semibold">{t(($) => $.header.title)}</h1>
          <p className="text-xs text-muted-foreground">{t(($) => $.header.subtitle)}</p>
        </div>
        <OrgCreateDialog orgUnits={orgUnits} />
      </PageHeader>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <section className="min-h-0 rounded-md border p-3">
          {treeLoading || listLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-5/6" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : (
            <OrgTreeView tree={tree} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          )}
        </section>
        <section className="min-h-0">
          <OrgDetailPanel orgUnit={selected} />
        </section>
      </main>
    </div>
  );
}
