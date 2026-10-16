import { expect, test } from "@playwright/test";

test.describe("marketing homepage", () => {
  test("renders the English hero and login CTA in the initial document", async ({
    browser,
  }) => {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "iteamify handles the business.",
    );
    await expect(
      page.getByRole("main").getByRole("link", { name: "Start with iteamify" }).first(),
    ).toHaveAttribute("href", "/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
    await page.close();
  });

  test("switches to the canonical Chinese route", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const languageGroup = page.getByRole("group", { name: "Change language" }).first();
    await languageGroup.getByRole("button", { name: "中文" }).click();

    await expect(page).toHaveURL(/\/zh-cn$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "你专注创造。",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  });

  test("disables decorative motion when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".iteamify-field")).toHaveCSS("animation-name", "none");
    const status = page.locator(".iteamify-running-status").first();
    const pseudoAnimation = await status.evaluate((element) =>
      getComputedStyle(element, "::after").animationName,
    );
    expect(pseudoAnimation).toBe("none");
  });
});
