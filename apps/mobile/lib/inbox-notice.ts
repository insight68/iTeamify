import type { InboxItem } from "@iteamify/core/types";

/** Mirrors Web's distinction between a failed and an unverified quick create. */
export function inboxNoticeLabel(item: InboxItem): string {
  if (item.type === "quick_create_unconfirmed") return "Outcome unconfirmed";
  if (item.type === "quick_create_failed") return "Could not create issue";
  if (item.type === "gmail_analysis") return "Email update";
  return item.severity === "action_required" ? "Action needed" : "Notification";
}

export function inboxNoticeDetails(item: InboxItem): string[] {
  // Display business content, never dump backend identifiers or raw metadata.
  return [...new Set([item.body, item.details?.error].filter((value): value is string => !!value?.trim()))];
}
