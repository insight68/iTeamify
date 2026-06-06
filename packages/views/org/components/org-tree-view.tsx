"use client";

import type { OrgTreeNode } from "@teamify/core/types";
import { useT } from "../../i18n";
import { OrgTreeNodeRow } from "./org-tree-node";

export function OrgTreeView({
  tree,
  selectedId,
  onSelect,
}: {
  tree: OrgTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useT("org");

  if (!tree || tree.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {t(($) => $.tree.empty)}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <OrgTreeNodeRow
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
