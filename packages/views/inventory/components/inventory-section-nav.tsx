"use client";

import { useWorkspacePaths } from "@teamify/core/paths";
import { cn } from "@teamify/ui/lib/utils";
import { useT } from "../../i18n";
import { useNavigation } from "../../navigation";

export function InventorySectionNav() {
  const { t } = useT("inventory");
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const items = [
    { label: t(($) => $.sections.dynamic), href: paths.inventory() },
    { label: t(($) => $.sections.monitor), href: paths.inventoryMonitor() },
  ];

  return (
    <nav aria-label={t(($) => $.sections.label)} className="mt-4 flex items-center gap-1 border-b">
      {items.map((item) => {
        const active = navigation.pathname === item.href;
        return (
          <button
            key={item.href}
            type="button"
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
            )}
            onClick={() => {
              if (!active) navigation.push(item.href);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
