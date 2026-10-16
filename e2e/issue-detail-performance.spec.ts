import { expect, test } from "@playwright/test";
import { createTestApi } from "./helpers";
import type { TestApiClient } from "./fixtures";

test("cold issue detail reads the target without loading unrelated issue lists", async ({ page }) => {
  let api: TestApiClient | undefined;
  const listReads: string[] = [];
  const detailReads: string[] = [];
  const pageErrors: string[] = [];
  try {
    api = await createTestApi();
    const workspace = (await api.getWorkspaces())[0]!;
    const title = `Detail request budget ${Date.now()}`;
    const issue = await api.createIssue(title, { description: "A cold detail must load this complete body." });
    const token = api.getToken();
    expect(issue.id).toBeTruthy();
    expect(token).toBeTruthy();
    await page.addInitScript((value) => {
      localStorage.setItem("iteamify_token", value!);
      localStorage.setItem("iteamify:chat:isOpen", "false");
    }, token);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path === "/api/issues" || path === "/api/issues/query" || path.startsWith("/api/issues/table/")) listReads.push(request.url());
      if (path === `/api/issues/${issue.id}` && request.method() === "GET") detailReads.push(request.url());
    });
    await page.goto(`/${workspace.slug}/issues/${issue.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[contenteditable="true"]').filter({ hasText: "A cold detail must load this complete body." })).toBeVisible();
    await expect(page.getByText("Activity", { exact: true })).toBeVisible();
    expect(detailReads).toHaveLength(1);
    expect(listReads).toEqual([]);
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: ".iteamify/performance/20261010/issue-detail-stage-a.png", fullPage: true });
  } finally {
    await api?.cleanup();
  }
});
