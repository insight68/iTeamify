import { describe, expect, it } from "vitest";
import en from "../../locales/en/autopilots.json";
import ja from "../../locales/ja/autopilots.json";
import ko from "../../locales/ko/autopilots.json";
import zhHans from "../../locales/zh-Hans/autopilots.json";

const TEMPLATE_IDS = [
  "daily_decisions",
  "weekly_business_review",
  "partnership_follow_up",
  "launch_readiness",
  "content_pipeline",
  "opportunity_radar",
] as const;

const LEGACY_TEMPLATE_IDS = [
  "daily_news",
  "pr_review",
  "bug_triage",
  "weekly_progress",
  "dependency_audit",
  "documentation_check",
] as const;

describe("Autopilot digital-manager positioning", () => {
  it.each([
    ["en", en],
    ["zh-Hans", zhHans],
    ["ja", ja],
    ["ko", ko],
  ])("keeps the business-first template contract in %s", (_locale, resource) => {
    expect(Object.keys(resource.templates)).toEqual(TEMPLATE_IDS);

    for (const id of TEMPLATE_IDS) {
      expect(resource.templates[id]).toEqual(
        expect.objectContaining({
          title: expect.any(String),
          summary: expect.any(String),
          category: expect.any(String),
          cadence: expect.any(String),
          output: expect.any(String),
        }),
      );
    }
  });

  it("removes the developer-workflow starter templates", () => {
    for (const id of LEGACY_TEMPLATE_IDS) {
      expect(en.templates).not.toHaveProperty(id);
      expect(zhHans.templates).not.toHaveProperty(id);
    }
  });

  it("states the Chinese creator value proposition directly", () => {
    expect(zhHans.page.empty.eyebrow).toBe("拓展业务的商务经理");
    expect(zhHans.page.empty.hint).toContain("合作、发布与复盘");
    expect(zhHans.dialog.runbook_label).toBe("经营委托");
  });
});
