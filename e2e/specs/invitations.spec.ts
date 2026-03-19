import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsMember } from "../helpers/auth";
import { createProject, createInvitation, addMember, expireInvitation } from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";

const API_URL = "http://localhost:3001";

test.beforeEach(async () => {
  await resetDatabase();
});

function opts(ctx: any, user: any) {
  return { request: ctx.request, cookie: user.cookie };
}

test.describe("Project invite links", () => {
  test("owner can create and revoke an invite link from the project page", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const project = await createProject(opts(ownerCtx, owner), { name: "Invite Board" });
    const page = await ownerCtx.newPage();

    await page.goto(`/projects/${project.id}`);

    await page.getByRole("button", { name: "Create Invite Link" }).click();
    await expect(page.getByText("Invite link created")).toBeVisible();
    await expect(page.getByText("/projects/invite/")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Revoke" }).click();

    await expect(page.getByText("Invite link revoked.")).toBeVisible();
    await expect(page.getByText("No active invite links yet.")).toBeVisible();

    await ownerCtx.close();
  });

  test("unauthenticated visitor returns to invite after login and can join the project", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const project = await createProject(opts(ownerCtx, owner), { name: "Join Me" });
    const invitation = await createInvitation(opts(ownerCtx, owner), project.id);

    const visitorCtx = await browser.newContext();
    const page = await visitorCtx.newPage();

    await page.goto(`/projects/invite/${invitation.token}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=.*${invitation.token}`));

    await loginAsMember(visitorCtx);
    await page.reload();

    await expect(page).toHaveURL(new RegExp(`/projects/invite/${invitation.token}$`));
    await expect(page.getByRole("heading", { name: "Join Me" })).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Join Project" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
    await expect(page.getByText("Join Me", { exact: true })).toBeVisible();

    await ownerCtx.close();
    await visitorCtx.close();
  });

  test("existing members see the already-member state", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = opts(ownerCtx, owner);
    const project = await createProject(ownerOptions, { name: "Already In" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOptions, project.id, member.userId);
    const invitation = await createInvitation(ownerOptions, project.id);

    const page = await memberCtx.newPage();
    await page.goto(`/projects/invite/${invitation.token}`);

    await expect(page.getByText("You are already a member of this project.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Project" })).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("revoked invite links show an unavailable state", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = opts(ownerCtx, owner);
    const project = await createProject(ownerOptions, { name: "Revoked" });
    const invitation = await createInvitation(ownerOptions, project.id);

    const revokeResponse = await ownerCtx.request.delete(
      `${API_URL}/api/v1/projects/${project.id}/invitations/${invitation.id}`,
      { headers: { Cookie: owner.cookie } },
    );
    expect(revokeResponse.ok()).toBeTruthy();

    const memberCtx = await browser.newContext();
    await loginAsMember(memberCtx);
    const page = await memberCtx.newPage();
    await page.goto(`/projects/invite/${invitation.token}`);

    await expect(page.getByText("Invite Unavailable")).toBeVisible();
    await expect(page.getByText("Invalid invitation")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("expired invite links show an unavailable state", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = opts(ownerCtx, owner);
    const project = await createProject(ownerOptions, { name: "Expired" });
    const invitation = await createInvitation(ownerOptions, project.id);

    await expireInvitation({ request: ownerCtx.request }, invitation.id);

    const memberCtx = await browser.newContext();
    await loginAsMember(memberCtx);
    const page = await memberCtx.newPage();
    await page.goto(`/projects/invite/${invitation.token}`);

    await expect(page.getByText("Invite Unavailable")).toBeVisible();
    await expect(page.getByText("Invitation expired")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("non-owners cannot create invite links", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const ownerOptions = opts(ownerCtx, owner);
    const project = await createProject(ownerOptions, { name: "Restricted Invite" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(ownerOptions, project.id, member.userId);

    const response = await memberCtx.request.post(
      `${API_URL}/api/v1/projects/${project.id}/invitations`,
      { headers: { Cookie: member.cookie } },
    );
    expect(response.status()).toBe(403);

    await ownerCtx.close();
    await memberCtx.close();
  });
});
