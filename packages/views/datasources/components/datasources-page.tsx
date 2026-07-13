"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataSourceListOptions } from "@teamify/core/datasources/queries";
import { useWorkspaceId } from "@teamify/core/hooks";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@teamify/ui/components/ui/tabs";
import { PageHeader } from "../../layout/page-header";
import { useT } from "../../i18n";
import { DataSourceCard } from "./datasource-card";
import { DataSourceCreateDialog } from "./datasource-create-dialog";
import { DataSourceDetail } from "./datasource-detail";
import { PermissionMatrix } from "./permission-matrix";

export function DataSourcesPage() {
  const { t } = useT("datasources");
  const wsId = useWorkspaceId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: dataSources = [], isLoading } = useQuery(dataSourceListOptions(wsId));
  const selected = useMemo(
    () => dataSources.find((source) => source.id === selectedId) ?? dataSources[0] ?? null,
    [dataSources, selectedId],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader className="justify-between px-5">
        <div>
          <h1 className="text-sm font-semibold">{t(($) => $.header.title)}</h1>
          <p className="text-xs text-muted-foreground">{t(($) => $.header.subtitle)}</p>
        </div>
        <DataSourceCreateDialog />
      </PageHeader>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(300px,420px)_1fr]">
        <section className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : dataSources.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              {t(($) => $.empty)}
            </div>
          ) : (
            dataSources.map((dataSource) => (
              <DataSourceCard
                key={dataSource.id}
                dataSource={dataSource}
                selected={selected?.id === dataSource.id}
                onSelect={() => setSelectedId(dataSource.id)}
              />
            ))
          )}
        </section>
        <section className="min-w-0">
          <Tabs defaultValue="detail">
            <TabsList>
              <TabsTrigger value="detail">{t(($) => $.tabs.detail)}</TabsTrigger>
              <TabsTrigger value="permissions">{t(($) => $.tabs.permissions)}</TabsTrigger>
            </TabsList>
            <TabsContent value="detail" className="mt-3">
              <DataSourceDetail dataSource={selected} />
            </TabsContent>
            <TabsContent value="permissions" className="mt-3">
              <PermissionMatrix />
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}
