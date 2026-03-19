import { test, expect } from "@playwright/test";
import { loginAsOwner, loginAsMember } from "../helpers/auth";
import { createProject, createInvitation, addMember } from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";
import type { APIRequestContext } from "@playwright/test";

const API_URL = "http://localhost:3001";

test.beforeEach(async () => {
  await resetDatabase();
});

function opts(ctx: any, user: any) {
  return { request: ctx.request, cookie: user.cookie };
}

/** Fetch pending invitations for a project and get the first one's real ID + token */
async function getFirstInvitation(
  request: APIRequestContext,
  cookie: string,
  projectId: string,
): Promise<{ id: string; token: string; email: string }> {
  // Get invitation list (returns real IDs)
  const listRes = await request.get(
    `${API_URL}/api/projects/${projectId}/invitations`,
    { headers: { Cookie: cookie } },
  );
  const invitations = await listRes.json();
  if (!invitations.length) throw new Error("No invitations found");
  const inv = invitations[0];

  // Get token via test-only endpoint
  const tokenRes = await request.get(
    `${API_URL}/api/test-auth/invitation-token/${inv.id}`,
  );
  const { token } = await tokenRes.json();

  return { id: inv.id, token, email: inv.email };
}

test.describe("Invitations", () => {
  test("create an invitation via API", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Invite Test" });

    await createInvitation(o, project.id, "newuser@test.local");

    // Verify via list endpoint
    const inv = await getFirstInvitation(ctx.request, owner.cookie, project.id);
    expect(inv.token).toBeDefined();
    expect(inv.email).toBe("newuser@test.local");

    await ctx.close();
  });

  test("cancel an invitation via API", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await loginAsOwner(ctx);
    const o = opts(ctx, owner);
    const project = await createProject(o, { name: "Cancel Test" });

    await createInvitation(o, project.id, "cancel@test.local");
    const inv = await getFirstInvitation(ctx.request, owner.cookie, project.id);

    const res = await ctx.request.delete(
      `${API_URL}/api/projects/${project.id}/invitations/${inv.id}`,
      { headers: { Cookie: owner.cookie } },
    );
    expect(res.ok()).toBeTruthy();

    // Verify it's gone from the list
    const listRes = await ctx.request.get(
      `${API_URL}/api/projects/${project.id}/invitations`,
      { headers: { Cookie: owner.cookie } },
    );
    const invitations = await listRes.json();
    expect(invitations).toHaveLength(0);

    await ctx.close();
  });

  test("accept invitation via token", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Accept Test" });

    await createInvitation(o, project.id, "member@test.local");
    const inv = await getFirstInvitation(ownerCtx.request, owner.cookie, project.id);

    // Member (member@test.local) accepts the invitation
    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);

    const res = await memberCtx.request.post(
      `${API_URL}/api/projects/invite/${inv.token}`,
      { headers: { Cookie: member.cookie } },
    );
    expect(res.ok()).toBeTruthy();

    // Verify member can see the project
    const page = await memberCtx.newPage();
    await page.goto("/projects");
    await expect(page.getByText("Accept Test")).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });

  test("non-owner cannot create invitations", async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const owner = await loginAsOwner(ownerCtx);
    const o = opts(ownerCtx, owner);
    const project = await createProject(o, { name: "Restricted Invite" });

    const memberCtx = await browser.newContext();
    const member = await loginAsMember(memberCtx);
    await addMember(o, project.id, member.userId);

    // Member tries to create invitation
    const res = await memberCtx.request.post(
      `${API_URL}/api/projects/${project.id}/invitations`,
      {
        data: { email: "sneaky@test.local" },
        headers: { Cookie: member.cookie },
      },
    );
    expect(res.status()).toBe(403);

    await ownerCtx.close();
    await memberCtx.close();
  });
});
