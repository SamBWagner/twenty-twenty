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
    await expect(page.getByTestId("review-option-disagreed").getByText("Disagreed", { exact: true })).toBeVisible();
    await expect(page.getByText("We did nothing, try again")).toBeVisible();

    const optionOrder = await page.locator('[data-testid="review-options"] > *').evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-testid"))
        .filter((id): id is string => id !== null),
    );
    expect(optionOrder).toEqual([
      "review-option-actioned",
      "review-option-disagreed",
      "review-option-did-nothing",
    ]);

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
    await expect(page.getByText("Your vote: Actioned")).toBeVisible();

    await page.getByRole("button", { name: /Accept Top Vote/ }).click();
    await expect(page.getByText("2/2")).toBeVisible();
    await expect(page.getByText("Add caching")).toBeVisible();

    await ctx.close();
  });

  test("submit did_nothing review", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);

    await page.getByRole("button", { name: /We did nothing, try again/ }).click();
    await expect(page.getByText("Your vote: Try Again")).toBeVisible();
    await page.getByRole("button", { name: /Accept Top Vote/ }).click();
    await expect(page.getByText("2/2")).toBeVisible();
    await expect(page.getByText("Add caching")).toBeVisible();

    await ctx.close();
  });

  test("disagree review requires comment", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const { project, s2 } = await setupReviewPhase(ctx, owner);
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${s2.id}`);

    // Fill in disagree comment and submit
    await page.getByPlaceholder("Tell us what happened...").fill("This was the wrong approach");
    await page.getByRole("button", { name: /Vote Disagreed/ }).click();
    await expect(page.getByText("Your vote: Disagreed")).toBeVisible();

    await page.getByRole("button", { name: /Accept Top Vote/ }).click();
    await expect(page.getByText("2/2")).toBeVisible();
    await expect(page.getByText("Add caching")).toBeVisible();

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
    await page.getByRole("button", { name: /Accept Top Vote/ }).click();
    await expect(page.getByText("Add caching")).toBeVisible();
    await page.getByRole("button", { name: /Actioned/ }).click();
    await page.getByRole("button", { name: /Accept Top Vote/ }).click();

    // Should transition to ideation phase after all reviews complete
    await expect(page.locator('button[data-live-phase="true"]')).toHaveText("Look Within", { timeout: 10_000 });
    await expect(page.locator('button[data-active-section="true"]')).toHaveText("Look Within");

    await ctx.close();
  });
});
