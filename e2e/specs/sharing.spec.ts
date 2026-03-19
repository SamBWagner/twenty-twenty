import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsGuest } from "../helpers/auth";
import {
  createProject,
  createSession,
  createItem,
  generateShareToken,
} from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

function opts(ctx: any, user: any) {
  return { request: ctx.request, cookie: user.cookie };
}

test.describe("Session Sharing & Guests", () => {
  test("generate a share token", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Share Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });

    const result = await generateShareToken(o, session.id);
    expect(result.shareToken).toBeDefined();

    await ctx.close();
  });

  test("join session as guest via share link", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Guest Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });
    const { shareToken } = await generateShareToken(o, session.id);

    // Guest joins via share link
    const guestCtx = await browser.newContext();
    await loginAsGuest(guestCtx);
    const page = await guestCtx.newPage();

    await page.goto(`/join/${shareToken}`);
    await expect(page.getByText("Retro 1")).toBeVisible();
    await page.getByRole("button", { name: /Join As Guest/ }).click();

    // Should redirect to the session
    await expect(page).toHaveURL(/\/sessions\//);

    await ownerCtx.close();
    await guestCtx.close();
  });

  test("join project permanently from share link", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Perm Join" });
    const session = await createSession(o, project.id, { name: "Retro 1" });
    const { shareToken } = await generateShareToken(o, session.id);

    const guestCtx = await browser.newContext();
    await loginAsGuest(guestCtx);
    const page = await guestCtx.newPage();

    await page.goto(`/join/${shareToken}`);
    await page.getByRole("button", { name: /Join Project/ }).click();

    // Should redirect to session
    await expect(page).toHaveURL(/\/sessions\//);

    // Verify guest is now a project member by checking project list
    await page.goto("/projects");
    await expect(page.getByText("Perm Join")).toBeVisible();

    await ownerCtx.close();
    await guestCtx.close();
  });

  test("invalid share token shows error", async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsGuest(ctx);
    const page = await ctx.newPage();

    await page.goto("/join/invalid-token-abc");
    await expect(page.getByText("Oops")).toBeVisible();

    await ctx.close();
  });

  test("unauthenticated user is redirected to login from join page", async ({ page }) => {
    await page.goto("/join/some-token");
    await expect(page).toHaveURL(/\/login/);
  });
});
