import { test, expect } from "@playwright/test";
import { loginAsOwner } from "../helpers/auth";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

test.describe("Authentication", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in with GitHub")).toBeVisible();
  });

  test("authenticated user can access /projects", async ({ browser }) => {
    const context = await browser.newContext();
    const { userId } = await loginAsOwner(context);
    const page = await context.newPage();

    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByText("Test Owner")).toBeVisible();

    await context.close();
  });

  test("session persists across page navigation", async ({ browser }) => {
    const context = await browser.newContext();
    await loginAsOwner(context);
    const page = await context.newPage();

    await page.goto("/projects");
    await expect(page.getByText("Test Owner")).toBeVisible();

    // Navigate away and back
    await page.goto("/projects/new");
    await expect(page.getByText("New")).toBeVisible();

    await page.goto("/projects");
    await expect(page.getByText("Test Owner")).toBeVisible();

    await context.close();
  });

  test("landing page shows sign-in CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Twenty Twenty" })).toBeVisible();
    await expect(page.getByText("Sign in with GitHub")).toBeVisible();
  });
});
