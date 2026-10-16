import { test, expect } from "@playwright/test";
import { TestApiClient } from "./fixtures";
import { waitForPageText } from "./helpers";

// Smoke tests for profile → workspace in the four-step onboarding flow.
// The source question stays in the workspace source-backfill prompt.
// Each run starts with a fresh user and captures screenshots for review.

const EMAIL = `onboarding-${Date.now()}@localhost`;
const SHOTS_DIR = "/tmp/onboarding-shots";

test.use({ viewport: { width: 1440, height: 900 } });

test("onboarding — profile answers → workspace", async ({ page }) => {
  const api = new TestApiClient();
  await api.login(EMAIL, "Onboarding Tester");
  const token = api.getToken();

  await page.addInitScript((t) => {
    localStorage.setItem("iteamify_token", t);
  }, token);
  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  await waitForPageText(page, "Tell us a bit about you.");

  // Step 1 introduces the product and asks for an optional free-text role.
  await expect(page.getByRole("heading", { name: "Tell us a bit about you." })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("What is your role?")).toBeVisible();
  await expect(page.getByText("What do you want to use iteamify for?")).toHaveCount(0);
  await expect(page.getByText(/Step 1 of 4/)).toBeVisible();
  await expect(page.getByText("How did you hear about iteamify?")).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS_DIR}/01-profile.png` });

  // Describe a role, then Continue → workspace step.
  await page.getByLabel("What is your role?").fill("Independent developer");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 sets up the workspace.
  await expect(page.getByRole("heading", { name: /Give your work a name/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Step 2 of 4/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS_DIR}/02-workspace.png` });
});

test("onboarding — profile can be filled in later", async ({ page }) => {
  const api = new TestApiClient();
  await api.login(`skip-${Date.now()}@localhost`, "Skipper");
  const token = api.getToken();

  await page.addInitScript((t) => localStorage.setItem("iteamify_token", t), token);
  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  await waitForPageText(page, "Tell us a bit about you.");
  await expect(page.getByText("Tell us a bit about you.")).toBeVisible({ timeout: 10000 });

  // The profile can be filled in later.
  await page.getByRole("button", { name: "Fill in later" }).click();
  await expect(page.getByRole("heading", { name: /Give your work a name/i })).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: `${SHOTS_DIR}/03-after-skip.png` });
});

test("onboarding — zh-Hans renders Chinese labels", async ({ page, context }) => {
  await context.addCookies([
    { name: "iteamify-locale", value: "zh-Hans", url: test.info().project.use.baseURL ?? "http://localhost:3000" },
  ]);
  const api = new TestApiClient();
  await api.login(`zh-${Date.now()}@localhost`, "中文用户");
  const token = api.getToken();

  await page.addInitScript((t) => localStorage.setItem("iteamify_token", t), token);
  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  await waitForPageText(page, "简单介绍一下你自己。");
  // Profile screen preserves the requested Chinese copy.
  await expect(page.getByText("简单介绍一下你自己。")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("你是什么角色？")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS_DIR}/04-profile-zh.png` });
});
