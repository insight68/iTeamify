"use client";
import type { ReactNode } from "react";
import { cn } from "@iteamify/ui/lib/utils";
export function formatChatTime(value: string): string {
    const date = new Date(value);
    const now = new Date();
    if (date.toDateString() === now.toDateString())
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString([], { ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), month: "numeric", day: "numeric" });
}
/** Shared presentation; session permissions and actions stay with each controller. */
export function ChatSessionRow({ title, time, active, unread, disabled, leading, detail, actions, onSelect }: {
    title: string;
    time: string;
    active: boolean;
    unread: boolean;
    disabled?: boolean;
    leading?: ReactNode;
    detail: ReactNode;
    actions?: ReactNode;
    onSelect: () => void;
}) {
    return <div role="button" aria-current={active ? "true" : undefined} tabIndex={0} onClick={() => { if (!disabled)
        onSelect(); }} onKeyDown={(event) => {
            if (event.target !== event.currentTarget || disabled || (event.key !== "Enter" && event.key !== " "))
                return;
            event.preventDefault();
            onSelect();
        }} className={cn("group/row relative flex h-14 min-w-0 cursor-default items-center gap-3 rounded-md px-2 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring", active ? "bg-accent" : "hover:bg-accent/50", disabled && "bg-destructive/5 hover:bg-destructive/5")}>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">{leading}
        <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium")}>{title}</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{time}</span>
      </div>
      {detail}
    </div>
    {actions}
  </div>;
}
