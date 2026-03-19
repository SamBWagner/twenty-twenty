import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsMember, loginAsUser } from "../helpers/auth";
import { createProject, addMember } from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

test.describe("Members", () => {
  test("owner sees themselves as a member", async ({ browser }) => {
    const context = await browser.newContext();
    const owner = await loginAsOwner(context);
    const opts = { request: context.request, cookie: owner.cookie };
    const project = await createProject(opts, { name: "My Team" });
    const page = await context.newPage();

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Test Owner")).toBeVisible();
    await expect(page.getByText("owner", { exact: true })).toBeVisible();

    await context.close();
  });

  test("added member appears in member list", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOpts = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOpts, { name: "Team Project" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);

    await addMember(ownerOpts, project.id, member.userId);

    // Owner sees member
    const page = await ownerCtx.newPage();
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Test Member")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("non-owner cannot add members via API", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOpts = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOpts, { name: "Restricted" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOpts, project.id, member.userId);

    // Member tries to add another user via API — should fail
    const thirdCtx = await browser.newContext();
    const third = await loginAsUser(thirdCtx, { name: "Third User", email: "third@test.local" });
    const memberOpts = { request: memberCtx.request, cookie: member.cookie };

    const res = await memberCtx.request.post(
      `http://localhost:3001/api/projects/${project.id}/members`,
      {
        data: { userId: third.userId },
        headers: { Cookie: member.cookie },
      },
    );
    expect(res.status()).toBe(403);

    await ownerCtx.close();
    await memberCtx.close();
    await thirdCtx.close();
  });
});
