import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsMember, loginAsUser } from "../helpers/auth";
import { createProject, addMember } from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

test.describe("Projects", () => {
  test("create a project via the form", async ({ browser }) => {
    const context = await browser.newContext();
    await loginAsOwner(context);
    const page = await context.newPage();

    await page.goto("/projects/new");
    await page.getByPlaceholder("e.g. Team Alpha Retros").fill("Sprint Team");
    await page.getByPlaceholder("What is this retro project for").fill("Weekly retros");
    await page.getByRole("button", { name: /Create Project/ }).click();

    // Should redirect to project detail
    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9_-]+$/);
    await expect(page.getByText("Sprint Team")).toBeVisible();

    await context.close();
  });

  test("view project list shows created projects", async ({ browser }) => {
    const context = await browser.newContext();
    const owner = await loginAsOwner(context);
    const page = await context.newPage();

    // Create projects via API
    await createProject(
      { request: context.request, cookie: owner.cookie },
      { name: "Project Alpha" },
    );
    await createProject(
      { request: context.request, cookie: owner.cookie },
      { name: "Project Beta" },
    );

    await page.goto("/projects");
    await expect(page.getByText("Project Alpha")).toBeVisible();
    await expect(page.getByText("Project Beta")).toBeVisible();

    await context.close();
  });

  test("empty state shows create prompt", async ({ browser }) => {
    const context = await browser.newContext();
    await loginAsOwner(context);
    const page = await context.newPage();

    await page.goto("/projects");
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await expect(page.getByText("Create your first project")).toBeVisible();

    await context.close();
  });

  test("project detail shows project info", async ({ browser }) => {
    const context = await browser.newContext();
    const owner = await loginAsOwner(context);
    const opts = { request: context.request, cookie: owner.cookie };
    const project = await createProject(opts, { name: "Detail Test", description: "A test project" });
    const page = await context.newPage();

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Detail Test")).toBeVisible();
    await expect(page.getByText("A test project")).toBeVisible();
    await expect(page.locator('[data-note-theme="sun"][data-tape-position="top-center"]').first()).toContainText("Project Space");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.locator('[data-note-theme="cobalt"][data-tape-position="top-right"]')).toContainText("Start a New Session");

    await context.close();
  });

  test("member sees project in their list", async ({ browser }) => {
    // Owner creates project
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOpts = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOpts, { name: "Shared Project" });

    // Create member
    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);

    // Owner adds member
    await addMember(ownerOpts, project.id, member.userId);

    // Member sees project
    const page = await memberCtx.newPage();
    await page.goto("/projects");
    await expect(page.getByText("Shared Project")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });
});
