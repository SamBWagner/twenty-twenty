import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsMember, loginAsUser } from "../helpers/auth";
import { createProject, addMember } from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

test.beforeEach(async () => {
  await resetDatabase();
});

test.describe("Project members", () => {
  test("owner sees themselves as a member and sees leave blocked messaging", async ({ browser }) => {
    const context = await browser.newContext();
    const owner = await loginAsOwner(context);
    const project = await createProject({ request: context.request, cookie: owner.cookie }, { name: "My Team" });
    const page = await context.newPage();

    await page.goto(`/projects/${project.id}`);

    await expect(page.getByText("Test Owner (You)")).toBeVisible();
    await expect(page.getByText("owner", { exact: true })).toBeVisible();
    await expect(page.getByText("Owners cannot leave a project until ownership transfer exists.")).toBeVisible();

    await context.close();
  });

  test("added members appear in the member list", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOptions, { name: "Team Project" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOptions, project.id, member.userId);

    const page = await ownerCtx.newPage();
    await page.goto(`/projects/${project.id}`);

    await expect(page.getByText("Test Member")).toBeVisible();
    await expect(page.getByLabel("Kick Test Member")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("owner can kick a member from the project page", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOptions, { name: "Kick Test" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOptions, project.id, member.userId);

    const ownerPage = await ownerCtx.newPage();
    await ownerPage.goto(`/projects/${project.id}`);

    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.getByLabel("Kick Test Member").click();

    await expect(ownerPage.getByText("Test Member was removed from the project.")).toBeVisible();
    await expect(ownerPage.getByLabel("Kick Test Member")).toHaveCount(0);

    const memberPage = await memberCtx.newPage();
    await memberPage.goto("/projects");
    await expect(memberPage.getByText("Kick Test")).toHaveCount(0);

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("members can leave a project from the project page", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOptions, { name: "Leave Test" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOptions, project.id, member.userId);

    const page = await memberCtx.newPage();
    await page.goto(`/projects/${project.id}`);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Leave Project" }).click();

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText("Leave Test")).toHaveCount(0);

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("non-owners cannot add members via API", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = { request: ownerCtx.request, cookie: owner.cookie };
    const project = await createProject(ownerOptions, { name: "Restricted" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOptions, project.id, member.userId);

    const thirdCtx = await browser.newContext();
    const third = await loginAsUser(thirdCtx, { name: "Third User", email: "third@test.local" });

    const response = await memberCtx.request.post(
      `http://localhost:3001/api/v1/projects/${project.id}/members`,
      {
        data: { userId: third.userId },
        headers: { Cookie: member.cookie },
      },
    );

    expect(response.status()).toBe(403);

    await ownerCtx.close();
    await memberCtx.close();
    await thirdCtx.close();
  });
});
