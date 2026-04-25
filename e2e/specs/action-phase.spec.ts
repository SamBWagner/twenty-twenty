import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth";
import {
  createProject,
  createSession,
  createItem,
  createAction,
  advancePhase,
} from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

function opts(ctx: any, user: any) {
  return { request: ctx.request, cookie: user.cookie };
}

/** Helper: create a session already in action phase */
async function setupActionPhase(ctx: any, owner: any) {
  const o = opts(ctx, owner);
  const project = await createProject(o, { name: "Action Test" });
  const session = await createSession(o, project.id, { name: "Retro 1" });
  await createItem(o, session.id, { type: "good", content: "Item A" });
  await createItem(o, session.id, { type: "bad", content: "Item B" });
  await advancePhase(o, session.id); // ideation -> action
  return { project, session, opts: o };
}

test.describe("Action Phase", () => {
  test("create a new action", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, session } = await setupActionPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await expect(page.locator('[data-note-theme="plum"][data-tape-position="top-center"]')).toContainText("Actions");
    await page.getByRole("button", { name: /New Action/ }).click();
    await page.getByPlaceholder("e.g. Set up weekly check-ins").fill("Automate deploys");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("Automate deploys")).toBeVisible();

    await ctx.close();
  });

  test("existing actions are shown", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, session, opts: o } = await setupActionPhase(ctx, owner);

    await createAction(o, session.id, { description: "Deploy Improvements" });

    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await expect(page.locator('[data-note-theme="plum"][data-tape-position="top-center"]')).toContainText("Actions");
    await expect(page.getByText("Deploy Improvements")).toBeVisible();

    await ctx.close();
  });

  test("unactioned items are shown", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, session } = await setupActionPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await expect(page.getByText("Item A")).toBeVisible();
    await expect(page.getByText("Item B")).toBeVisible();

    await ctx.close();
  });

  test("cannot create bundles outside action phase via API", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Phase Guard" });
    const session = await createSession(o, project.id, { name: "Retro 1" });

    // Session is in ideation phase — bundles should fail
    const res = await ctx.request.post(
      `http://localhost:3001/api/v1/sessions/${session.id}/bundles`,
      {
        data: { label: "Should fail" },
        headers: { Cookie: owner.cookie },
      },
    );
    expect(res.ok()).toBeFalsy();

    await ctx.close();
  });
});
