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

/** Helper: set up two sessions where session 2 is in review phase */
async function setupReviewPhase(ctx: any, owner: any) {
  const o = opts(ctx, owner);
  const project = await createProject(o, { name: "Review Test" });

  // Session 1: create items, advance to action, create actions, close
  const s1 = await createSession(o, project.id, { name: "Retro 1" });
  await createItem(o, s1.id, { type: "bad", content: "Slow CI" });
  await advancePhase(o, s1.id); // ideation -> action
  await createAction(o, s1.id, { description: "Optimize CI pipeline" });
  await createAction(o, s1.id, { description: "Add caching" });
  await advancePhase(o, s1.id); // action -> closed

  // Session 2: should start in review
  const s2 = await createSession(o, project.id, { name: "Retro 2" });

  return { project, s1, s2, opts: o };
}

test.describe("Review Phase", () => {
  test("shows pending actions from previous session", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);
    await expect(page.getByText("Reviewing Previous Actions")).toBeVisible();
    await expect(page.getByText("Optimize CI pipeline")).toBeVisible();

    await ctx.close();
  });

  test("submit actioned review", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);
    await expect(page.getByText("Reviewing Previous Actions")).toBeVisible();

    // Review first action as "actioned"
    await page.getByRole("button", { name: /Actioned/ }).click();

    // Progress should update (reviewed 2 of 2 shown, since progress = reviewed + currentIndex + 1)
    await expect(page.getByText("2/2")).toBeVisible();

    await ctx.close();
  });

  test("submit did_nothing review", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);

    await page.getByRole("button", { name: /We did nothing/ }).click();
    await expect(page.getByText("2/2")).toBeVisible();

    await ctx.close();
  });

  test("disagree review requires comment", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);

    // Fill in disagree comment and submit
    await page.getByPlaceholder("Explain why").fill("This was the wrong approach");
    await page.getByRole("button", { name: /Submit/ }).click();

    await expect(page.getByText("2/2")).toBeVisible();

    await ctx.close();
  });

  test("auto-advance to ideation when all reviewed", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);

    // Review both actions
    await page.getByRole("button", { name: /Actioned/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Actioned/ }).click();

    // Should transition to ideation phase after all reviews complete
    await expect(page.getByText("ideation", { exact: true })).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });
});
