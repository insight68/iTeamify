"use client";

import { Bot } from "lucide-react";

/**
 * CSS-only simulation of Teamify's issue interface showing agent "Atlas"
 * working. Card frame with title bar, issue header, assignee badge, 3
 * activity items, and a blinking "typing" indicator. The outer wrapper
 * uses animate-mockup-float for a gentle bob effect.
 */
export function HeroMockup() {
  return (
    <div className="animate-mockup-float">
      <div
        className="relative mx-auto w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-2xl ring-1 ring-foreground/5"
        role="img"
        aria-label="Agent Atlas working on an issue"
      >
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-border/40">
          <span className="size-2.5 rounded-full bg-muted" />
          <span className="size-2.5 rounded-full bg-muted" />
          <span className="size-2.5 rounded-full bg-muted" />
          <span className="ml-2 text-xs text-muted-foreground">
            teamify / ENG-142
          </span>
        </div>

        {/* Issue body */}
        <div className="p-4 space-y-3">
          {/* Issue header */}
          <div>
            <p className="text-sm font-medium text-foreground">
              Fix auth token refresh race
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                In Progress
              </span>
              <span className="text-xs text-muted-foreground">ENG-142</span>
            </div>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <Bot className="size-3.5" aria-hidden />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              Atlas · Coding Agent
            </span>
          </div>

          {/* Activity items */}
          <div className="space-y-2">
            <ActivityItem
              actor="Atlas"
              action="commented"
              time="2 min ago"
              accent="purple"
            />
            <ActivityItem
              actor="Atlas"
              action="changed status to In Progress"
              time="5 min ago"
              accent="purple"
            />
            <ActivityItem
              actor="Atlas"
              action="self-assigned this issue"
              time="8 min ago"
              accent="purple"
            />
          </div>

          {/* Typing indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <Bot className="size-3" aria-hidden />
            </span>
            <span>Atlas is typing</span>
            <span className="animate-pulse">...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({
  actor,
  action,
  time,
  accent,
}: {
  actor: string;
  action: string;
  time: string;
  accent: "purple" | "brand";
}) {
  const colorClasses =
    accent === "purple"
      ? "bg-purple-100 text-purple-700"
      : "bg-brand/10 text-brand";
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${colorClasses}`}>
        {accent === "purple" ? (
          <Bot className="size-3" aria-hidden />
        ) : (
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
        )}
      </span>
      <div className="min-w-0">
        <span className="font-medium text-foreground">{actor}</span>{" "}
        <span className="text-muted-foreground">{action}</span>
        <span className="ml-1 text-muted-foreground/70">{time}</span>
      </div>
    </div>
  );
}