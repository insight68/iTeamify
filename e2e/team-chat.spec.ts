import "./env";
import { test, expect, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { TestApiClient } from "./fixtures";

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.PORT || "8080"}`;

async function authenticate(context: BrowserContext, api: TestApiClient) {
  await context.addInitScript((token) => {
    localStorage.setItem("iteamify_token", token!);
    localStorage.setItem("iteamify:chat:isOpen", "false");
  }, api.getToken());
}

test("team sidebar supports private realtime replies and resumes the latest active AI chat", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  if (!databaseUrl) throw new Error("Team E2E requires an explicit DATABASE_URL");
  const db = new pg.Client(databaseUrl);
  await db.connect();
  const alice = new TestApiClient();
  const bob = new TestApiClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const contexts: BrowserContext[] = [];
  let workspace: { id: string; slug: string } | undefined;
  try {
    const a = await alice.login(`team-alice-${suffix}@example.com`, "Team Alice");
    const b = await bob.login(`team-bob-${suffix}@example.com`, "Team Bob");
    workspace = await alice.ensureWorkspace("Team acceptance", `team-${suffix}`);
    // Seed only this test's workspace membership and AI history. Actual human
    // messages below go through the browser, HTTP handlers, DB and WebSocket.
    await db.query("INSERT INTO member(workspace_id,user_id,role) VALUES($1,$2,'member')", [workspace.id, b.user.id]);
    await alice.markUserOnboarded();
    await bob.markUserOnboarded();
    const runtime = await db.query(
      `INSERT INTO agent_runtime(workspace_id,name,runtime_mode,provider,status,device_info,metadata,last_seen_at)
       VALUES($1,'Team fixture runtime','cloud','e2e_team','online','Test runtime','{}',now()) RETURNING id`,
      [workspace.id],
    );
    const agent = await db.query(
      `INSERT INTO agent(workspace_id,name,description,runtime_mode,runtime_config,visibility,max_concurrent_tasks,owner_id,runtime_id)
       VALUES($1,'Team Assistant','','cloud','{}','workspace',1,$2,$3) RETURNING id`,
      [workspace.id, a.user.id, runtime.rows[0].id],
    );
    const sessions = await db.query(
      `INSERT INTO chat_session(workspace_id,agent_id,creator_id,title,status)
       VALUES($1,$2,$3,'Old renamed chat','active'),
             ($1,$2,$3,'Recent active chat','active'),
             ($1,$2,$3,'Recent archived chat','archived') RETURNING id,title`,
      [workspace.id, agent.rows[0].id, a.user.id],
    );
    for (let i = 0; i < sessions.rows.length; i++) {
      await db.query(
        `INSERT INTO chat_message(chat_session_id,role,content,created_at)
         VALUES($1,'user','Fixture conversation',now()-($2::int * interval '1 hour'))`,
        [sessions.rows[i].id, 3 - i],
      );
    }
    await db.query("UPDATE chat_session SET updated_at=now(),pinned_at=now() WHERE id=$1", [sessions.rows[0].id]);

    const contextA = await browser.newContext({ locale: "en-US" });
    const contextB = await browser.newContext({ locale: "en-US" });
    contexts.push(contextA, contextB);
    await authenticate(contextA, alice);
    await authenticate(contextB, bob);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const errors: string[] = [];
    pageA.on("pageerror", (error) => errors.push(error.message));
    pageB.on("pageerror", (error) => errors.push(error.message));
    await pageA.goto(`/${workspace.slug}/issues`);
    await pageB.goto(`/${workspace.slug}/issues`);
    await expect(pageA.getByText("My team", { exact: true })).toBeVisible();
    const sidebarA = pageA.locator('[data-slot="sidebar-content"]');
    const sidebarB = pageB.locator('[data-slot="sidebar-content"]');
    const assistant = sidebarA.getByRole("link", { name: /Team Assistant/ });
    const member = sidebarA.getByRole("link", { name: "Message Team Bob", exact: true });
    await expect(assistant.getByText("AI", { exact: true })).toBeVisible();
    await expect(member).toBeVisible();
    await expect(sidebarA.locator(`a[href="/${workspace.slug}/chat?member=${a.user.id}"]`)).toHaveCount(0);
    await expect(assistant).toHaveAttribute("href", `/${workspace.slug}/chat?agent=${agent.rows[0].id}&session=${sessions.rows[1].id}`);
    await assistant.click();
    await expect(pageA).toHaveURL(new RegExp(`session=${sessions.rows[1].id}`), { timeout: 120_000 });
    await expect(pageA.getByText("Fixture conversation", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await pageA.getByRole("button", { name: "Archived", exact: true }).click();
    await expect(pageA.getByRole("button", { name: /Recent archived chat/ })).toBeVisible();
    await expect(pageA.locator('div[role="button"]').filter({ hasText: "Recent active chat" })).toHaveCount(0);

    await member.click();
    await expect(pageA).toHaveURL(new RegExp(`member=${b.user.id}`));
    await pageA.getByRole("textbox", { name: /Team Bob/ }).fill("Hello from Alice");
    await pageA.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pageA.getByRole("log").getByText("Hello from Alice", { exact: true })).toBeVisible();
    const aliceOnB = sidebarB.getByRole("link", { name: /Team Alice/ });
    await expect(aliceOnB.getByRole("img", { name: "Unread messages" })).toBeVisible();
    await aliceOnB.click();
    await expect(pageB.getByRole("log").getByText("Hello from Alice", { exact: true })).toBeVisible();
    await pageB.getByRole("textbox", { name: /Team Alice/ }).fill("Reply from Bob");
    await pageB.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pageA.getByRole("log").getByText("Reply from Bob", { exact: true })).toBeVisible();
    await expect(aliceOnB.getByRole("img", { name: "Unread messages" })).toHaveCount(0);
    const order = await sidebarA.getByRole("link").evaluateAll((links) => links.map((link) => link.textContent));
    expect(order.findIndex((label) => label?.includes("Team Bob"))).toBeLessThan(order.findIndex((label) => label?.includes("Team Assistant")));

    // Navigation does not erase a member's unsent draft.
    await pageA.getByRole("textbox", { name: /Team Bob/ }).fill("Unsent member draft");
    await assistant.click();
    await member.click();
    await expect(pageA.getByRole("textbox", { name: /Team Bob/ })).toHaveValue("Unsent member draft");
    const originalUrl = pageA.url();
    const originalSession = new URL(originalUrl).searchParams.get("session");
    expect(originalSession).toBeTruthy();
    await member.click();
    expect(pageA.url()).toBe(originalUrl);
    await expect(pageA.getByRole("textbox", { name: /Team Bob/ })).toHaveValue("Unsent member draft");
    await pageA.getByRole("button", { name: "New session", exact: true }).click();
    await expect(pageA).toHaveURL(/new=/);
    await expect(pageA.getByRole("textbox", { name: /Team Bob/ })).toHaveValue("");
    const beforeSend = await db.query("SELECT count(*)::int AS count FROM chat_session WHERE workspace_id=$1 AND kind='direct'", [workspace.id]);
    expect(beforeSend.rows[0].count).toBe(1);
    // The server commits the first message, but the client loses the receipt.
    // The private WS acknowledgement must still open the committed session.
    await pageA.route("**/api/chat/sessions", async (route) => {
      if (route.request().method() === "POST" && route.request().postDataJSON()?.content === "Second topic") {
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await pageA.getByRole("textbox", { name: /Team Bob/ }).fill("Second topic");
    await pageA.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pageA).toHaveURL(/session=/);
    const secondSession = new URL(pageA.url()).searchParams.get("session");
    expect(secondSession).not.toBe(originalSession);
    await expect(pageA.getByRole("log").getByText("Second topic", { exact: true })).toBeVisible();
    await pageA.unroute("**/api/chat/sessions");
    await pageA.reload();
    await expect(pageA.getByRole("log").getByText("Second topic", { exact: true })).toBeVisible();
    await pageA.getByRole("button", { name: /Hello from Alice/ }).click();
    await expect(pageA.getByRole("textbox", { name: /Team Bob/ })).toHaveValue("Unsent member draft");
    await expect(pageA.getByRole("log").getByText("Reply from Bob", { exact: true })).toBeVisible();
    await expect(pageA.getByRole("log").getByText("Second topic", { exact: true })).toHaveCount(0);
    const listOnBob = await fetch(`${apiBase}/api/chat/sessions?kind=direct&peer_user_id=${a.user.id}`, { headers: { Authorization: `Bearer ${bob.getToken()}`, "X-Workspace-ID": workspace.id } });
    expect(listOnBob.status).toBe(200);
    expect((await listOnBob.json()).sessions).toHaveLength(2);
    await pageA.screenshot({ path: testInfo.outputPath("team-private-chat.png"), fullPage: true });
    await pageA.setViewportSize({ width: 390, height: 844 });
    await pageA.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(pageA.getByRole("log")).toHaveCount(0);
    await pageA.getByRole("button", { name: /Hello from Alice/ }).click();
    await expect(pageA.getByRole("log").getByText("Reply from Bob", { exact: true })).toBeVisible();
    expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await pageA.screenshot({ path: testInfo.outputPath("team-private-chat-mobile.png"), fullPage: true });
    await pageA.setViewportSize({ width: 1280, height: 720 });
    await expect(sidebarA.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
    await pageA.goto(`/${workspace.slug}/settings?tab=members`);
    await expect(pageA).toHaveURL(new RegExp("settings\\?tab=members"), { timeout: 60_000 });
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    if (workspace) {
      const deleted = await fetch(`${apiBase}/api/workspaces/${workspace.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${alice.getToken()}` },
      });
      expect(deleted.status).toBe(204);
      const remaining = await db.query("SELECT count(*)::int AS count FROM chat_session WHERE workspace_id=$1", [workspace.id]);
      expect(remaining.rows[0].count).toBe(0);
    }
    await db.end();
  }
});
