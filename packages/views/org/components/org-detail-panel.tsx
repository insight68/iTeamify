"use client";

import type { OrgUnitResponse } from "@teamify/core/types";
import { Badge } from "@teamify/ui/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@teamify/ui/components/ui/tabs";
import { PermissionTab } from "./permission-tab";

export function OrgDetailPanel({ orgUnit }: { orgUnit: OrgUnitResponse | null }) {
  if (!orgUnit) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        选择左侧节点查看详情
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
              {orgUnit.description || "暂无描述"}
            </p>
          </div>
          <Badge variant="secondary">{orgUnit.type}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">排序</div>
            {orgUnit.sort_order}
          </div>
          <div>
            <div className="font-medium text-foreground">父级</div>
            {orgUnit.parent_id || "无"}
          </div>
        </div>
      </div>
      <Tabs defaultValue="permissions" className="p-4">
        <TabsList>
          <TabsTrigger value="permissions">权限</TabsTrigger>
          <TabsTrigger value="meta">元信息</TabsTrigger>
        </TabsList>
        <TabsContent value="permissions" className="mt-4">
          <PermissionTab orgUnitId={orgUnit.id} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4 space-y-2 text-sm text-muted-foreground">
          <div>ID：{orgUnit.id}</div>
          <div>创建：{orgUnit.created_at}</div>
          <div>更新：{orgUnit.updated_at}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
