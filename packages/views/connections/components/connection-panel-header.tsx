import type { LucideIcon } from "lucide-react";

export function ConnectionPanelHeader({
  icon: Icon,
  title,
  description,
  scope,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  scope: string;
}) {
  return (
    <header className="flex min-w-0 items-start gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-raised shadow-xs">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-pretty">{title}</h2>
          <span className="rounded-full border border-surface-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {scope}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
    </header>
  );
}
