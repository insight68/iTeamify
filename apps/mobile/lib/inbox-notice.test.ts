import { describe, expect, it } from "vitest";
import type { InboxItem } from "@iteamify/core/types";
import { inboxNoticeDetails, inboxNoticeLabel } from "./inbox-notice";

describe("notification details", () => {
  it("keeps an unconfirmed quick-create outcome distinct from failure", () => {
    expect(inboxNoticeLabel({ type: "quick_create_unconfirmed" } as InboxItem)).toBe("Outcome unconfirmed");
    expect(inboxNoticeLabel({ type: "quick_create_failed" } as InboxItem)).toBe("Could not create issue");
  });
  it("shows email content once without exposing arbitrary metadata", () => {
    const notice: InboxItem = {
      id: "notice", workspace_id: "workspace", recipient_type: "member", recipient_id: "user",
      actor_type: "system", actor_id: null, type: "gmail_analysis", severity: "info", issue_id: null,
      title: "Email", body: "Review the email", issue_status: null, read: false, archived: false,
      created_at: "2026-09-07T00:00:00Z", details: { error: "Review the email", internal_key: "private" },
    };
    expect(inboxNoticeLabel(notice)).toBe("Email update");
    expect(inboxNoticeDetails(notice)).toEqual(["Review the email"]);
  });
});
