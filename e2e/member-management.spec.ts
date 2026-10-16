import { test, expect, type Page } from "@playwright/test";

const now = "2026-10-12T00:00:00Z";
const wid = "10000000-0000-4000-8000-000000000001";
const alice = "20000000-0000-4000-8000-000000000001";
const bob = "20000000-0000-4000-8000-000000000002";
const membership = "30000000-0000-4000-8000-000000000002";
const appId = "40000000-0000-4000-8000-000000000001";
const topicId = "60000000-0000-4000-8000-000000000001";

// These browser tests verify client navigation and mutation contracts against
// deterministic API responses. They do not replace backend integration tests.
async function setup(page: Page, viewerRole = "owner", hasHistory = false) {
  const workspace = { id: wid, slug: "membercheck", name: "Member acceptance", description: "", context: "", settings: {}, repos: [], issue_prefix: "MEM", avatar_url: null, created_at: now, updated_at: now };
  let members = [
    { id: "30000000-0000-4000-8000-000000000001", user_id: alice, workspace_id: wid, name: "Alice", email: "alice@example.test", role: viewerRole, avatar_url: null, profile_description: "Workspace owner", created_at: now },
    { id: membership, user_id: bob, workspace_id: wid, name: "Bob Legal", email: "bob@example.test", role: "member", avatar_url: null, profile_description: "Commercial contracts and legal review", created_at: now },
  ];
  let applications: Record<string, unknown>[] = [];
  let invitations: Record<string, unknown>[] = [];
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const transcriptRequests: string[] = [];
  const topic = { id: topicId, workspace_id: wid, kind: "direct", peer_user_id: bob, title: "Contract discussion", has_unread: true, last_sequence: 0, last_message_at: null, last_message_content: "", created_at: now };
  let rejectRemoval = true;
  await page.context().addCookies([{ name: "iteamify_locale", value: "en", url: test.info().project.use.baseURL! }]);
  await page.addInitScript(() => {
    localStorage.setItem("iteamify_token", "member-ui-fixture");
    localStorage.setItem("iteamify:chat:isOpen", "false");
  });
  await page.routeWebSocket("**/ws*", (socket) => socket.close());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const input = method === "GET" ? {} : request.postDataJSON() ?? {};
    if (method !== "GET") requests.push({ path, method, body: input });
    let body: unknown = [];
    let status = 200;
    if (path === "/api/me") body = { id: alice, name: "Alice", email: "alice@example.test", avatar_url: null, onboarded_at: now, language: "en", timezone: null, profile_description: "", created_at: now, updated_at: now };
    else if (path === "/api/config") body = { password_auth_enabled: false, allow_signup: false };
    else if (path === "/api/workspaces") body = [workspace];
    else if (path === "/api/team/activity") body = hasHistory ? [{ target_type: "member", target_id: bob, last_contact_at: now, resume_session_id: topicId, has_unread: true }] : [];
    else if (path === "/api/chat/sessions" && url.searchParams.get("kind") === "direct") body = { sessions: hasHistory ? [topic] : [], next_cursor: null };
    else if (path === `/api/chat/sessions/${topicId}`) { transcriptRequests.push(path); body = topic; }
    else if (path === `/api/chat/sessions/${topicId}/messages/page`) { transcriptRequests.push(path); body = { messages: [], has_more: false, next_cursor: null, read_sequence: 0, can_send: true }; }

    else if (path === `/api/workspaces/${wid}/members`) {
      if (method === "POST") {
        body = { id: "50000000-0000-4000-8000-000000000001", workspace_id: wid, inviter_id: alice, invitee_email: input.email, invitee_user_id: null, role: input.role, status: "pending", created_at: now, updated_at: now, expires_at: "2026-10-20T00:00:00Z" };
        invitations.push(body as Record<string, unknown>);
      } else body = members;
    } else if (path === `/api/workspaces/${wid}/members/${membership}`) {
      if (method === "PATCH") {
        members = members.map((member) => member.id === membership ? { ...member, role: input.role } : member);
        body = members.find((member) => member.id === membership);
      } else if (rejectRemoval) {
        rejectRemoval = false; status = 500; body = { error: "Temporary removal failure" };
      } else { members = members.filter((member) => member.id !== membership); status = 204; }
    } else if (path === `/api/workspaces/${wid}/invitations`) body = invitations;
    else if (path.startsWith(`/api/workspaces/${wid}/invitations/`)) { invitations = []; status = 204; }
    else if (path === "/api/session-applications" && method === "GET") body = { applications: ["conversation", "contract_review"], can_manage: viewerRole === "owner", providers: applications.filter((application) => application.status === "enabled"), configurations: viewerRole === "owner" ? applications : [] };
    else if (path.startsWith("/api/session-applications") && (method === "POST" || method === "PUT")) {
      body = { ...input, id: appId, type: "contract_review", target_name: "Bob Legal", version: Number(input.version) + 1, available: true, updated_at: now };
      applications = [body as Record<string, unknown>];
    } else if (path === "/api/issues" || path === "/api/issues/query") body = { issues: [], total: 0, has_more: false, next_cursor: null };
    else if (path === "/api/issues/table/rows") body = { query_fingerprint: "fixture", rows: [], total: 0, branch_total: 0, next_cursor: null };
    else if (path === "/api/issues/table/facets") body = { query_fingerprint: "fixture", facets: [], total: 0 };
    else if (path === "/api/properties") body = { properties: [], total: 0 };
    await route.fulfill({ status, contentType: "application/json", ...(status === 204 ? {} : { body: JSON.stringify(body) }) });
  });
  return { requests, transcriptRequests, setApplications: (rows: Record<string, unknown>[]) => { applications = rows; } };
}

test("members navigate and complete application and membership management", async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("Base UI:") || message.text().includes("[api-schema]")) errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/membercheck/members");
  const table = page.getByRole("table", { name: "Members" });
  const sidebarMember = page.locator(`a[data-sidebar="menu-button"][href="/membercheck/chat?member=${bob}&view=list"]`);
  await expect(sidebarMember).toBeVisible();
  await expect(page.getByRole("link", { name: "Message Bob Legal", exact: true })).toHaveAttribute("href", `/membercheck/chat?member=${bob}&view=list`);
  await sidebarMember.locator('[data-slot="avatar"]').click();
  await expect(page).toHaveURL(`/membercheck/chat?member=${bob}&view=list`, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Conversation topics with Bob Legal" })).toBeVisible();
  expect(fixture.transcriptRequests).toEqual([]);
  await page.goto("/membercheck/members");
  await expect(table.getByRole("link", { name: "Bob Legal", exact: true })).toBeVisible();
  await table.getByRole("link", { name: "Bob Legal", exact: true }).click();
  await expect(page).toHaveURL(`/membercheck/members/${bob}`, { timeout: 30_000 });
  await expect(page.locator("header").getByRole("link", { name: "Member acceptance", exact: true })).toHaveAttribute("href", "/membercheck");
  await page.locator("header").getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL("/membercheck/members");
  await table.getByRole("link", { name: "View Bob Legal details" }).click();
  await expect(page.getByRole("heading", { name: "Bob Legal" })).toBeVisible();
  await page.getByRole("tab", { name: "Applications", exact: true }).click();
  await page.getByRole("button", { name: "Add configuration" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Bob Legal", { exact: true })).toBeVisible();
  await dialog.getByLabel("Service name", { exact: true }).fill("Commercial review");
  await dialog.getByLabel("Public service description").fill("Contract checks and suggested revisions");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit configuration" }).click();
  await dialog.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByRole("button", { name: "New contract review session" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New contract review session" })).toHaveCount(0);
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".iteamify/members-check/desktop-detail.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Manage Bob Legal" }).click();
  await page.getByRole("menuitem", { name: "Change role" }).hover();
  await page.getByRole("menuitem", { name: "Admin", exact: true }).click();
  await expect.poll(() => fixture.requests.some((request) => request.method === "PATCH" && request.path.endsWith(membership) && request.body.role === "admin")).toBe(true);
  await page.getByRole("button", { name: "Manage Bob Legal" }).click();
  await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(confirm.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(`/membercheck/members/${bob}`);
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL("/membercheck/members");
  await expect(table.getByRole("link", { name: "Bob Legal", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await dialog.getByRole("textbox").fill("invitee@example.test");
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await page.getByRole("button", { name: "Pending invitations" }).click();
  await expect(page.getByText("invitee@example.test", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revoke invitation" }).click();
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("No pending invitations")).toBeVisible();
  expect(fixture.requests.filter((request) => request.path.startsWith("/api/session-applications")).every((request) => request.body.target_id === bob)).toBe(true);
  expect(errors).toEqual([]);
});

test("team member entry keeps the topic list even with a recent conversation", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await setup(page, "owner", true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/membercheck/members");
  const listUrl = `/membercheck/chat?member=${bob}&view=list`;
  const member = page.locator(`a[data-sidebar="menu-button"][href="${listUrl}"]`);
  await member.getByText("Bob Legal", { exact: true }).click();
  await expect(page).toHaveURL(listUrl, { timeout: 30_000 });
  const topic = page.getByRole("button", { name: /Contract discussion/ });
  await expect(topic).toBeVisible();
  expect(fixture.transcriptRequests).toEqual([]);
  await expect(member).toHaveAttribute("data-active", "");
  await topic.click();
  await expect(page).toHaveURL(`/membercheck/chat?member=${bob}&session=${topicId}`);
  await expect(page.getByRole("textbox")).toBeVisible();
  await member.click();
  await expect(page).toHaveURL(listUrl);
  await expect(topic).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await topic.click();
  await expect(page.getByRole("textbox")).toBeVisible();
  await page.getByRole("link", { name: "Message Bob Legal", exact: true }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(fixture.requests).toEqual([]);
});

test("member detail stays usable on a narrow screen", async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/membercheck/members");
  const table = page.getByRole("table", { name: "Members" });
  await expect(table.getByRole("link", { name: "View Bob Legal details" })).toBeVisible();
  const row = table.getByRole("row").filter({ has: page.getByRole("link", { name: "Bob Legal", exact: true }) });
  const nameBounds = await row.getByRole("link", { name: "Bob Legal", exact: true }).boundingBox();
  const roleBounds = await row.getByText("Member", { exact: true }).boundingBox();
  expect(Math.abs(nameBounds!.y - roleBounds!.y)).toBeLessThan(20);
  expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: ".iteamify/members-check/mobile-list.png", fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: "View Bob Legal details" }).click();
  await page.getByRole("tab", { name: "Applications", exact: true }).click();
  await expect(page.getByText("No additional applications enabled")).toBeVisible();
  await page.screenshot({ path: ".iteamify/members-check/mobile-detail.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Add configuration" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: ".iteamify/members-check/mobile-application.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByLabel("Service name", { exact: true }).fill("Mobile contract review");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Mobile contract review", { exact: true })).toBeVisible();
  expect(fixture.requests.find((request) => request.method === "POST" && request.path === "/api/session-applications")?.body).toMatchObject({ target_id: bob, status: "draft" });
});
