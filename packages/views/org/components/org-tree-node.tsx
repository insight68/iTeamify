"use client";

import { ChevronRight, Building2, Network, Users } from "lucide-react";
import type { OrgTreeNode, OrgUnitType } from "@teamify/core/types";
import { Button } from "@teamify/ui/components/ui/button";
import { cn } from "@teamify/ui/lib/utils";

function OrgIcon({ type }: { type: OrgUnitType }) {
  if (type === "company") return <Building2 className="size-4" />;
  if (type === "department") return <Network className="size-4" />;
  return <Users className="size-4" />;
}

export function OrgTreeNodeRow({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: OrgTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-9 w-full justify-start gap-2 rounded-md px-2 text-left",
          selectedId === node.id && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft: `${8 + depth * 18}px` }}
        onClick={() => onSelect(node.id)}
      >
        <ChevronRight className={cn("size-3 shrink-0", !hasChildren && "opacity-0")} />
        <OrgIcon type={node.type} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {node.type}
        </span>
      </Button>
      {node.children?.map((child) => (
        <OrgTreeNodeRow
          key={child.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
