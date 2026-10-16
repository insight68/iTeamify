import { test, expect } from "@playwright/test";
import { TestApiClient } from "./fixtures";

const code = process.env.ITEAMIFY_DEV_VERIFICATION_CODE;
const password = "River morning forest lantern";
const nextPassword = "Meadow evening cloud lantern";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.PORT || "8080"}`;

test.describe("password authentication", () => {
  test.skip(!code, "A development verification code is required for purpose-hashed email challenges");

  for (const registered of [false, true]) {
    test(`email invitation prefills verification-code login for an ${registered ? "existing passwordless account" : "unregistered email"}`, async ({ page }) => {
      test.setTimeout(120000);
      const stamp = Date.now();
      const ownerEmail = `password-e2e-inviter-${stamp}@example.test`;
      const email = `password-e2e-invitee-${stamp}@example.test`;
      const owner = new TestApiClient();
      const invitee = new TestApiClient();
      try {
        await owner.login(ownerEmail, "Invitation Owner");
        const workspace = await owner.ensureWorkspace("Invitation E2E", `password-e2e-invite-${stamp}`);
        if (registered) await invitee.login(email, "Invited User");
        const response = await fetch(`${API_BASE}/api/workspaces/${workspace.id}/members`, {
          method: "POST",
          headers: { Authorization: `Bearer ${owner.getToken()}`, "Content-Type": "application/json", "X-Workspace-ID": workspace.id },
          body: JSON.stringify({ email, role: "member" }),
        });
        expect(response.status).toBe(201);
        const invitation = await response.json();

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`/invite/${invitation.id}`);
        await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`/invite/${invitation.id}`)}`), { timeout: 30000 });
        await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
        await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await page.locator('input[autocomplete="one-time-code"]').fill(code!);
        if (!registered) {
          await page.getByLabel("New password", { exact: true }).fill(password);
          await page.getByRole("button", { name: "Create account", exact: true }).click();
        }
        await expect(page).toHaveURL(new RegExp(`/invite/${invitation.id}$`), { timeout: 30000 });
        await page.getByRole("button", { name: "Accept & Join", exact: true }).click();
        await expect(page.getByRole("heading", { name: `You joined ${workspace.name}!`, exact: true })).toBeVisible();
      } finally {
        await owner.cleanupPasswordIdentity(email);
        await owner.cleanupPasswordIdentity(ownerEmail);
      }
    });
  }

  test("registers, resets the password, revokes the old token, and signs in again", async ({ page, browser, baseURL }) => {
    test.setTimeout(120000);
    const email = `password-e2e-signup-${Date.now()}@example.test`;
    const api = new TestApiClient();
    let recovery: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/login");
      await page.getByRole("button", { name: "Create an account", exact: true }).click();
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.locator('input[autocomplete="one-time-code"]').fill(code!);
      await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
      await page.getByLabel("New password", { exact: true }).fill(password);
      const signupResponse = page.waitForResponse((response) => response.url().endsWith("/auth/signup") && response.status() === 200);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      const { token } = await (await signupResponse).json();
      await expect(page).toHaveURL(/\/onboarding/);

      recovery = await browser.newContext({ baseURL, locale: "en-US" });
      const recover = await recovery.newPage();
      await recover.goto("/login");
      await recover.getByRole("button", { name: "Forgot password?", exact: true }).click();
      await recover.getByLabel("Email", { exact: true }).fill(email);
      await recover.getByRole("button", { name: "Continue", exact: true }).click();
      await recover.locator('input[autocomplete="one-time-code"]').fill(code!);
      await recover.getByLabel("New password", { exact: true }).fill(nextPassword);
      await recover.getByRole("button", { name: "Save password", exact: true }).click();
      await expect(recover.getByText("Password updated", { exact: true })).toBeVisible();
      await expect(recover).toHaveURL(/\/login/);
      const expired = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
      expect(expired.status).toBe(401);
      await recover.getByRole("button", { name: "Back to sign in", exact: true }).click();
      await expect(recover.getByLabel("Email", { exact: true })).toHaveValue(email);
      await recover.getByLabel("Password", { exact: true }).fill(nextPassword);
      await recover.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(recover).toHaveURL(/\/onboarding/);
    } finally {
      await recovery?.close();
      await api.cleanupPasswordIdentity(email);
    }
  });

  test("an existing account can add and change a password without losing its workspace", async ({ page }) => {
    test.setTimeout(120000);
    const email = `password-e2e-existing-${Date.now()}@example.test`;
    const api = new TestApiClient();
    try {
      await api.login(email, "Password Test User");
      const workspace = await api.ensureWorkspace("Password E2E", `password-e2e-${Date.now()}`);
      await api.markUserOnboarded();
      await page.addInitScript((token) => {
        if (!localStorage.getItem("password-e2e-seeded")) {
          localStorage.setItem("iteamify_token", token!);
          localStorage.setItem("password-e2e-seeded", "1");
        }
      }, api.getToken());
      await page.goto(`/${workspace.slug}/settings?tab=profile`);
      const settings = page.locator("section").filter({ has: page.getByRole("heading", { name: "Password", exact: true }) });
      await settings.getByRole("button", { name: "Set password", exact: true }).click();
      await settings.getByRole("button", { name: "Send verification code", exact: true }).click();
      await settings.locator('input[autocomplete="one-time-code"]').fill(code!);
      await settings.getByRole("button", { name: "Verify code", exact: true }).click();
      await settings.getByLabel("New password", { exact: true }).fill(password);
      await settings.getByRole("button", { name: "Save password", exact: true }).click();
      await expect(settings.getByRole("button", { name: "Change password", exact: true })).toBeVisible();
      await page.reload();
      await settings.getByRole("button", { name: "Change password", exact: true }).click();
      await settings.getByLabel("Current password", { exact: true }).fill(password);
      await settings.getByLabel("New password", { exact: true }).fill(nextPassword);
      await settings.getByRole("button", { name: "Save password", exact: true }).click();
      await expect(settings.getByRole("button", { name: "Change password", exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${workspace.slug}/settings`));
    } finally { await api.cleanupPasswordIdentity(email); }
  });
});
