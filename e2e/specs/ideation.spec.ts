import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth";
import { createProject, createSession } from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

function opts(ctx: any, user: any) {
  return { request: ctx.request, cookie: user.cookie };
}

test.describe("Ideation Phase", () => {
  test("create a good item", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Ideation Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await page.getByPlaceholder("Something that went well").fill("Great pairing sessions");
    await page.getByPlaceholder("Something that went well").press("Enter");

    await expect(page.getByText("Great pairing sessions")).toBeVisible();

    await ctx.close();
  });

  test("create a bad item", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Ideation Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${session.id}`);
    await page.getByPlaceholder("Something that could improve").fill("Too many meetings");
    await page.getByPlaceholder("Something that could improve").press("Enter");

    await expect(page.getByText("Too many meetings")).toBeVisible();

    await ctx.close();
  });

  test("vote on an item", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Vote Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${session.id}`);

    // Create an item first
    await page.getByPlaceholder("Something that went well").fill("Good code reviews");
    await page.getByPlaceholder("Something that went well").press("Enter");
    await expect(page.getByText("Good code reviews")).toBeVisible();

    // Upvote
    await page.getByRole("button", { name: "Upvote Good code reviews" }).click();

    // Vote count should show 1
    await expect(page.getByText("1").first()).toBeVisible();

    await ctx.close();
  });

  test("delete own item", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Delete Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });
    const page = await ctx.newPage();

    await page.goto(`/projects/${project.id}/sessions/${session.id}`);

    await page.getByPlaceholder("Something that went well").fill("Temporary item");
    await page.getByPlaceholder("Something that went well").press("Enter");
    await expect(page.getByText("Temporary item")).toBeVisible();

    // Delete button should be visible for own item
    await page.getByRole("button", { name: "Delete Temporary item" }).click();
    await expect(page.getByText("Temporary item")).not.toBeVisible();

    await ctx.close();
  });

  test("cannot create items outside ideation phase via API", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Phase Guard" });
    const session = await createSession(o, project.id, { name: "Retro 1" });

    // Add item and advance to action
    const { createItem, advancePhase } = await import("../helpers/factories");
    await createItem(o, session.id, { type: "good", content: "Filler" });
    await advancePhase(o, session.id);

    // Try creating an item in action phase
    const res = await ctx.request.post(
      `http://localhost:3001/api/v1/sessions/${session.id}/items`,
      {
        data: { type: "good", content: "Should fail" },
        headers: { Cookie: owner.cookie },
      },
    );
    expect(res.ok()).toBeFalsy();

    await ctx.close();
  });
});
