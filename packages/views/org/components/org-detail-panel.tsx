"use client";

import type { OrgUnitResponse } from "@teamify/core/types";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@teamify/ui/components/ui/tabs";
import { useT } from "../../i18n";
import { PermissionTab } from "./permission-tab";

export function OrgDetailPanel({ orgUnit }: { orgUnit: OrgUnitResponse | null }) {
  const { t } = useT("org");
  if (!orgUnit) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t(($) => $.detail.empty)}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{orgUnit.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {orgUnit.description || t(($) => $.detail.no_description)}
            </p>
          </div>
          <Badge variant="secondary">{orgUnit.type}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{t(($) => $.detail.sort_order)}</div>
            {orgUnit.sort_order}
          </div>
          <div>
            <div className="font-medium text-foreground">{t(($) => $.detail.parent)}</div>
            {orgUnit.parent_id || t(($) => $.detail.parent_none)}
          </div>
        </div>
      </div>
      <Tabs defaultValue="permissions" className="p-4">
        <TabsList>
          <TabsTrigger value="permissions">{t(($) => $.detail.tabs.permissions)}</TabsTrigger>
          <TabsTrigger value="meta">{t(($) => $.detail.tabs.meta)}</TabsTrigger>
        </TabsList>
        <TabsContent value="permissions" className="mt-4">
          <PermissionTab orgUnitId={orgUnit.id} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4 space-y-2 text-sm text-muted-foreground">
          <div>{t(($) => $.detail.meta.id, { value: orgUnit.id })}</div>
          <div>{t(($) => $.detail.meta.created_at, { value: orgUnit.created_at })}</div>
          <div>{t(($) => $.detail.meta.updated_at, { value: orgUnit.updated_at })}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
