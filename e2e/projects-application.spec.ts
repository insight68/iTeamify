import { test, expect, type Page } from "@playwright/test";

const wid = "11000000-0000-4000-8000-000000000001";
const uid = "22000000-0000-4000-8000-000000000001";
const pid = "33000000-0000-4000-8000-000000000001";
const now = "2026-10-15T00:00:00Z";

// Deterministic client acceptance; database and task-queue behavior are covered
// separately by the project workflow Go integration tests.
async function setup(page: Page) {
  const workspace = {
    id: wid,
    slug: "projectcheck",
    name: "Project acceptance",
    description: "",
    context: "",
    settings: {},
    repos: [],
    issue_prefix: "PRJ",
    avatar_url: null,
    created_at: now,
    updated_at: now,
  };
  let project: Record<string, unknown> | undefined;
  const actions: Record<string, unknown>[] = [];
  await page
    .context()
    .addCookies([
      {
        name: "iteamify_locale",
        value: "en",
        url: test.info().project.use.baseURL!,
      },
    ]);
  await page.addInitScript(() =>
    localStorage.setItem("iteamify_token", "project-ui-fixture"),
  );
  await page.routeWebSocket("**/ws*", (socket) => socket.close());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const input =
      request.method() === "GET" ? {} : (request.postDataJSON() ?? {});
    let body: unknown = [];
    if (path === "/api/me")
      body = {
        id: uid,
        name: "Alice",
        email: "alice@example.test",
        avatar_url: null,
        onboarded_at: now,
        language: "en",
        timezone: null,
        created_at: now,
        updated_at: now,
      };
    else if (path === "/api/config")
      body = { password_auth_enabled: false, allow_signup: false };
    else if (path === "/api/workspaces") body = [workspace];
    else if (path === `/api/workspaces/${wid}/members`)
      body = [
        {
          id: "44000000-0000-4000-8000-000000000001",
          workspace_id: wid,
          user_id: uid,
          name: "Alice",
          email: "alice@example.test",
          role: "owner",
          avatar_url: null,
          created_at: now,
        },
      ];
    else if (path === "/api/session-applications")
      body = {
        applications: ["conversation", "contract_review", "projects"],
        can_manage: true,
        providers: [],
        configurations: [],
      };
    else if (path === "/api/projects" && request.method() === "POST") {
      project = {
        ...input,
        id: pid,
        workspace_id: wid,
        icon: null,
        lead_type: null,
        lead_id: null,
        status: "planned",
        priority: "none",
        workflow_status: "planned",
        result: "",
        review_note: "",
        version: 1,
        can_manage: true,
        can_submit: true,
        can_review: true,
        execution_active: false,
        created_at: now,
        updated_at: now,
      };
      body = project;
    } else if (path === "/api/projects/workflows")
      body = project ? [project] : [];
    else if (path === `/api/projects/${pid}`) body = project;
    else if (path === `/api/projects/${pid}/resources`)
      body = { resources: [], total: 0 };
    else if (path === `/api/projects/${pid}/workflow`) {
      if (request.method() === "POST") {
        actions.push(input);
        if (input.action === "assign")
          project = {
            ...project,
            lead_type: input.assignee_type,
            lead_id: input.assignee_id,
            workflow_status: "in_progress",
          };
        if (input.action === "submit")
          project = {
            ...project,
            result: input.result,
            workflow_status: "in_review",
          };
        if (input.action === "reject")
          project = {
            ...project,
            result: "",
            review_note: input.note,
            workflow_status: "in_progress",
          };
        if (input.action === "approve")
          project = {
            ...project,
            review_note: input.note,
            workflow_status: "completed",
            status: "completed",
          };
        project = { ...project, version: Number(project?.version) + 1 };
      }
      body = project;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return actions;
}

test("Projects runs initiation and acceptance from Applications", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const actions = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/projectcheck/applications");
  await page.getByRole("link", { name: "Open projects" }).click();
  await expect(page).toHaveURL(/\/projectcheck\/projects$/);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByLabel("Project name").fill("Market report");
  await page
    .getByLabel("Goal and background")
    .fill("Research our target market.");
  await page
    .getByLabel("Acceptance criteria", { exact: true })
    .fill("A report with source links.");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`));
  await page
    .getByLabel("Choose a person or agent")
    .selectOption(`member:${uid}`);
  await page.getByRole("button", { name: "Assign and start" }).click();
  await page.getByLabel("Deliverable", { exact: true }).fill("First report");
  await page.getByRole("button", { name: "Submit for acceptance" }).click();
  await page.getByLabel("Review notes").fill("Add source links.");
  await page.getByRole("button", { name: "Request changes" }).click();
  await page
    .getByLabel("Deliverable", { exact: true })
    .fill("[Report with sources](https://example.test/report)");
  await page.getByRole("button", { name: "Submit for acceptance" }).click();
  await page.getByRole("button", { name: "Accept project" }).click();
  await expect(
    page.getByText("The project has passed acceptance."),
  ).toBeVisible();
  expect(actions.map((a) => a.action)).toEqual([
    "assign",
    "submit",
    "reject",
    "submit",
    "approve",
  ]);
  expect(actions.at(-1)).toMatchObject({
    result: "[Report with sources](https://example.test/report)",
    version: 5,
  });
  await page.screenshot({
    path: "/private/tmp/iteamify-project-accepted-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Market report" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/private/tmp/iteamify-project-accepted-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
