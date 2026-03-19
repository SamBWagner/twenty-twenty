import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsMember } from "../helpers/auth";
import {
  createProject,
  createSession,
  addMember,
} from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

function opts(ctx: any, user: any) {
  return { request: ctx.request, cookie: user.cookie };
}

test.describe("Real-time Collaboration", () => {
  test("item created by one user appears for another", async ({ browser }) => {
    // Setup: owner creates project + session, adds member
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Realtime Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(o, project.id, member.userId);

    // Both users open the session
    const ownerPage = await ownerCtx.newPage();
    const memberPage = await memberCtx.newPage();

    await ownerPage.goto(`/projects/${project.id}/sessions/${session.id}`);
    await memberPage.goto(`/projects/${project.id}/sessions/${session.id}`);

    // Wait for pages to load
    await expect(ownerPage.getByText("Went Well")).toBeVisible();
    await expect(memberPage.getByText("Went Well")).toBeVisible();

    // Owner creates an item
    await ownerPage.getByPlaceholder("Something that went well").fill("Live update test");
    await ownerPage.getByPlaceholder("Something that went well").press("Enter");

    // Member should see it appear via WebSocket
    await expect(memberPage.getByText("Live update test")).toBeVisible({ timeout: 10_000 });

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("phase change updates the live phase without forcing everyone to switch views", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Phase Sync" });
    const session = await createSession(o, project.id, { name: "Retro 1" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(o, project.id, member.userId);

    const ownerPage = await ownerCtx.newPage();
    const memberPage = await memberCtx.newPage();

    await ownerPage.goto(`/projects/${project.id}/sessions/${session.id}`);
    await memberPage.goto(`/projects/${project.id}/sessions/${session.id}`);

    await expect(memberPage.locator('button[data-live-phase="true"]')).toHaveText("Ideation");
    await expect(memberPage.locator('button[data-active-section="true"]')).toHaveText("Ideation");

    // Owner adds item and advances to action
    await ownerPage.getByPlaceholder("Something that went well").fill("Test item");
    await ownerPage.getByPlaceholder("Something that went well").press("Enter");
    await expect(ownerPage.getByText("Test item")).toBeVisible();

    await ownerPage.getByRole("button", { name: "Advance to Actions" }).click();
    await expect(ownerPage.getByRole("dialog")).toContainText("Move to Actions?");
    await ownerPage.getByRole("button", { name: "Yes, Move to Actions" }).click();

    // Member should see the live phase change, but stay on ideation until they choose otherwise
    await expect(memberPage.locator('button[data-live-phase="true"]')).toHaveText("Actions", { timeout: 10_000 });
    await expect(memberPage.locator('button[data-active-section="true"]')).toHaveText("Ideation");
    await expect(memberPage.getByText("Went Well")).toBeVisible();
    await expect(memberPage.getByText("Test item")).toBeVisible();

    await memberPage.getByRole("button", { name: "Actions" }).click();
    await expect(memberPage.locator('button[data-active-section="true"]')).toHaveText("Actions");
    await expect(memberPage.getByText("Unactioned Items")).toBeVisible({ timeout: 10_000 });

    await memberPage.getByRole("button", { name: "Ideation" }).click();
    await expect(memberPage.locator('button[data-active-section="true"]')).toHaveText("Ideation");
    await expect(memberPage.getByText("Went Well")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("user presence is shown", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Presence Test" });
    const session = await createSession(o, project.id, { name: "Retro 1" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(o, project.id, member.userId);

    const ownerPage = await ownerCtx.newPage();
    await ownerPage.goto(`/projects/${project.id}/sessions/${session.id}`);
    await expect(ownerPage.getByText("Went Well")).toBeVisible();

    // Member joins — owner should see their avatar/presence
    const memberPage = await memberCtx.newPage();
    await memberPage.goto(`/projects/${project.id}/sessions/${session.id}`);

    // Owner should see member's avatar (first letter "T" for "Test Member")
    await expect(ownerPage.getByTitle("Test Member")).toBeVisible({ timeout: 10_000 });

    await ownerCtx.close();
    await memberCtx.close();
  });
});
