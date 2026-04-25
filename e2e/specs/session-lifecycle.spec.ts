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
    await expect(page.getByTestId("session-project-tab")).toContainText("Lifecycle Test");
    await expect(page.locator('button[data-live-phase="true"]')).toHaveText("Look Within");
    await expect(page.locator('button[data-active-section="true"]')).toHaveText("Look Within");

    await ctx.close();
  });

  test("review tab shows an empty state on the first session", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const opts = ownerOpts(ctx, owner);
    const project = await createProject(opts, { name: "First Review State" });
    const session = await createSession(opts, project.id, { name: "Retro 1" });

    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}/sessions/${session.id}`);

    await expect(page.getByTestId("session-project-tab")).toContainText("First Review State");
    await page.getByRole("button", { name: "Look Back" }).click();
    await expect(page.getByText("Nothing to review yet")).toBeVisible();
    await expect(page.getByText("doesn't have any actions from a previous retrospective yet")).toBeVisible();

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
    await expect(page.getByTestId("session-project-tab")).toContainText("Phase Test");
    await expect(page.locator('button[data-live-phase="true"]')).toHaveText("Look Within");

    // Click advance button
    await page.getByRole("button", { name: "Advance to Look Forward" }).click();
    await expect(page.getByRole("dialog")).toContainText("Move to Look Forward?");
    await page.getByRole("button", { name: "Yes, Move Forward" }).click();
    await expect(page.locator('button[data-live-phase="true"]')).toHaveText("Look Forward");
    await expect(page.locator('button[data-active-section="true"]')).toHaveText("Look Forward");
    await expect(page.locator('[data-note-theme="plum"][data-tape-position="top-center"]')).toContainText("Actions");

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
      `http://localhost:3001/api/v1/sessions/${session.id}/phase`,
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
    await createAction(opts, session.id, { description: "Publish retro recap" });

    const page = await ctx.newPage();
    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await page.getByRole("button", { name: "Finish Session" }).click();
    await expect(page.getByRole("dialog")).toContainText("Close this retrospective?");
    await page.getByRole("button", { name: "Yes, Finish Session" }).click();

    await expect(page.getByTestId("session-project-tab")).toContainText("Close Test");
    await expect(page.getByTestId("summary-project-tab")).toContainText("Close Test");
    await expect(page.getByText("Final Summary")).toBeVisible();
    await expect(page.getByText("Publish retro recap")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Summary" })).toBeVisible();
    await expect(page.locator('button[data-live-phase="true"]')).toHaveText("Summary");
    await expect(page.locator('[data-note-theme="sun"][data-tape-position="top-center"]')).toContainText("Final Summary");
    await expect(page.locator('[data-note-theme="mint"][data-tape-position="top-center"]')).toContainText("Went Well");
    await expect(page.locator('[data-note-theme="blush"][data-tape-position="top-right"]')).toContainText("Needs Work");
    await expect(page.locator('[data-note-theme="plum"][data-tape-position="side-left"]')).toContainText("Action Plan");

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
    await expect(page.getByTestId("session-project-tab")).toContainText("Review Start");
    await expect(page.getByText("Reviewing Previous Actions")).toBeVisible();
    await expect(page.locator('[data-note-theme="light-peach"][data-tape-position="top-center"]')).toContainText("Reviewing Previous Actions");

    await ctx.close();
  });
});
