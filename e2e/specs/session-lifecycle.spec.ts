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

function ownerOpts(ctx: any, owner: any) {
  return { request: ctx.request, cookie: owner.cookie };
}

test.describe("Session Lifecycle", () => {
  test("first session starts in ideation phase", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "Lifecycle Test" });
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}`);
    await page.getByPlaceholder("e.g. Sprint 14 Retro").fill("Sprint 1");
    await page.getByRole("button", { name: /Go/ }).click();

    // Should navigate to session page showing ideation phase
    await expect(page).toHaveURL(/\/sessions\//);
    await expect(page.getByText("ideation")).toBeVisible();

    await ctx.close();
  });

  test("session sequence auto-increments", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "Seq Test" });

    const s1 = await createSession(opts, project.id, { name: "Retro 1" });
    const s2 = await createSession(opts, project.id, { name: "Retro 2" });

    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}`);

    await expect(page.getByText("#1")).toBeVisible();
    await expect(page.getByText("#2")).toBeVisible();

    await ctx.close();
  });

  test("advance from ideation to action phase", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "Phase Test" });
    const session = await createSession(opts, project.id, { name: "Retro 1" });

    // Must have at least one item to advance
    await createItem(opts, session.id, { type: "good", content: "Great teamwork" });

    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await expect(page.getByText("ideation")).toBeVisible();

    // Click advance button
    await page.getByRole("button", { name: /Actions/ }).click();
    await expect(page.getByText("action", { exact: true })).toBeVisible();

    await ctx.close();
  });

  test("cannot advance ideation without items", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "No Items" });
    const session = await createSession(opts, project.id, { name: "Retro 1" });

    // Try advancing via API without items
    const res = await ctx.request.patch(
      `http://localhost:3001/api/sessions/${session.id}/phase`,
      { headers: { Cookie: owner.cookie } },
    );
    expect(res.ok()).toBeFalsy();

    await ctx.close();
  });

  test("close a session from action phase", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "Close Test" });
    const session = await createSession(opts, project.id, { name: "Retro 1" });
    await createItem(opts, session.id, { type: "good", content: "Good stuff" });
    await advancePhase(opts, session.id); // ideation -> action

    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await page.getByRole("button", { name: /Close/ }).click();
    await expect(page.getByText("closed", { exact: true })).toBeVisible();

    await ctx.close();
  });

  test("session with previous actions starts in review phase", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "Review Start" });

    // Create session 1, add items, advance to action, add action, close
    const s1 = await createSession(opts, project.id, { name: "Retro 1" });
    await createItem(opts, s1.id, { type: "bad", content: "Slow deploys" });
    await advancePhase(opts, s1.id); // ideation -> action
    await createAction(opts, s1.id, { description: "Speed up CI" });
    await advancePhase(opts, s1.id); // action -> closed

    // Create session 2 — should start in review
    const s2 = await createSession(opts, project.id, { name: "Retro 2" });
    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);
    await expect(page.getByText("Reviewing Previous Actions")).toBeVisible();

    await ctx.close();
  });
});
