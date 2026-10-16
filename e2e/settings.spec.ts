import { test, expect } from "@playwright/test";
import { loginAsDefault, waitForPageText } from "./helpers";

test.describe("Settings", () => {
  test("updating workspace name reflects in sidebar immediately", async ({
    page,
  }) => {
    const workspaceSlug = await loginAsDefault(page);

    // Read the current workspace name from the sidebar
    const sidebarName = page.getByRole("button", { name: /E2E Workspace/ }).first();
    const originalName = (await sidebarName.innerText()).split("\n").pop()?.trim() ?? "E2E Workspace";

    await page.goto(`/${workspaceSlug}/settings?tab=workspace`, { waitUntil: "domcontentloaded" });
    await waitForPageText(page, "General");

    // Change workspace name
    const nameInput = page
      .locator('input[type="text"]')
      .first();
    await nameInput.clear();
    const newName = "Renamed WS " + Date.now();
    await nameInput.fill(newName);

    // Save
    await page.locator("button", { hasText: "Save" }).click();

    await expect(page.getByText("Workspace settings saved").first()).toBeVisible({ timeout: 5000 });

    // Sidebar should reflect the new name WITHOUT page refresh
    await expect(page.getByRole("button", { name: new RegExp(newName) }).first()).toBeVisible();

    // Restore original name so other tests aren't affected
    await nameInput.clear();
    await nameInput.fill(originalName.trim());
    await page.locator("button", { hasText: "Save" }).click();
    await expect(page.getByText("Workspace settings saved").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: new RegExp(originalName) }).first()).toBeVisible();
  });

  // Composio connect flow, fully mocked at the network boundary so it runs
  // without a configured COMPOSIO_API_KEY or a live Composio project. The
  // backend redirect is simulated by pointing the init endpoint's redirect_url
  // straight back at Connections with ?connected=<slug> — exercising the
  // callback toast + connections refresh (MUL-3718) end to end.
  test("connecting Gmail shows a toast and refreshes the list", async ({
    page,
  }) => {
    const workspaceSlug = await loginAsDefault(page);
    const connectionsUrl = `/${workspaceSlug}/connections?view=apps`;

    // Stateful: connections is empty until the (mocked) connect flow lands.
    let connected = false;

    await page.route("**/api/integrations/composio/toolkits", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { slug: "gmail", name: "Gmail", connectable: true },
        ]),
      }),
    );

    await page.route("**/api/integrations/composio/connections", (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          connected
            ? [
                {
                  id: "conn-gmail-1",
                  toolkit_slug: "gmail",
                  status: "active",
                  connected_at: new Date().toISOString(),
                  last_used_at: null,
                },
              ]
            : [],
        ),
      });
    });

    await page.route("**/api/integrations/composio/connect/init", (route) => {
      // Composio would 302 through its hosted consent and back to our callback,
      // which returns to the Connections apps view with a one-shot success
      // parameter. Point directly at that workspace route so the test exercises
      // the same callback-consumption behavior real users see.
      connected = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          redirect_url: `/${workspaceSlug}/connections?view=apps&connected=gmail`,
        }),
      });
    });

    await page.goto(connectionsUrl, { waitUntil: "domcontentloaded" });
    await waitForPageText(page, "Connected apps");

    // Gmail starts disconnected → click Connect.
    await page.getByRole("button", { name: /^Connect$/ }).first().click();

    // Success toast from the simulated callback redirect.
    await expect(page.getByText("Connected").first()).toBeVisible({ timeout: 10000 });

    // List refreshed without a manual reload: the Gmail card now offers
    // Disconnect, and the one-shot ?connected param has been stripped.
    await expect(
      page.getByRole("button", { name: /Disconnect/ }).first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveURL(/connected=gmail/);
  });
});
