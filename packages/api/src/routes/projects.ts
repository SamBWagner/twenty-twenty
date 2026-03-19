import { Hono } from "hono";
import { eq, and, gt, or, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";

export const projectRoutes = new Hono();

// List user's projects
projectRoutes.get("/projects", requireAuth, async (c) => {
  const user = c.get("user");
  const memberships = await db
    .select({
      project: schema.projects,
      role: schema.projectMembers.role,
    })
    .from(schema.projectMembers)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectMembers.projectId))
    .where(eq(schema.projectMembers.userId, user.id));

  return c.json(memberships.map((m) => ({ ...m.project, role: m.role })));
});

// Create project
projectRoutes.post("/projects", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name?.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }

  const now = new Date();
  const project = {
    id: newId(),
    name: body.name.trim(),
    description: body.description?.trim() || null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.projects).values(project);
  await db.insert(schema.projectMembers).values({
    projectId: project.id,
    userId: user.id,
    role: "owner",
    joinedAt: now,
  });

  return c.json(project, 201);
});

// Get project detail
projectRoutes.get("/projects/:pid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return c.json({ error: "Not found" }, 404);
  }

  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, pid)).get();
  const members = await db
    .select({
      userId: schema.projectMembers.userId,
      role: schema.projectMembers.role,
      username: schema.user.name,
      avatarUrl: schema.user.image,
    })
    .from(schema.projectMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.projectMembers.userId))
    .where(eq(schema.projectMembers.projectId, pid));

  return c.json({ ...project, members });
});

// Update project
projectRoutes.patch("/projects/:pid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, pid),
        eq(schema.projectMembers.userId, user.id),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{ name?: string; description?: string }>();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;

  await db.update(schema.projects).set(updates).where(eq(schema.projects.id, pid));
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, pid)).get();

  return c.json(project);
});

// Delete project
projectRoutes.delete("/projects/:pid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, pid),
        eq(schema.projectMembers.userId, user.id),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, pid));
  return c.json({ ok: true });
});

// List members
projectRoutes.get("/projects/:pid/members", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return c.json({ error: "Not found" }, 404);
  }

  const members = await db
    .select({
      userId: schema.projectMembers.userId,
      role: schema.projectMembers.role,
      joinedAt: schema.projectMembers.joinedAt,
      username: schema.user.name,
      avatarUrl: schema.user.image,
    })
    .from(schema.projectMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.projectMembers.userId))
    .where(eq(schema.projectMembers.projectId, pid));

  return c.json(members);
});

// Add member (by user ID — frontend resolves GitHub username to user)
projectRoutes.post("/projects/:pid/members", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, pid),
        eq(schema.projectMembers.userId, user.id),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{ userId: string }>();
  const targetUser = await db.select().from(schema.user).where(eq(schema.user.id, body.userId)).get();
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  await db
    .insert(schema.projectMembers)
    .values({
      projectId: pid,
      userId: body.userId,
      role: "member",
      joinedAt: new Date(),
    })
    .onConflictDoNothing();

  return c.json({ ok: true }, 201);
});

// Remove member
projectRoutes.delete("/projects/:pid/members/:uid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");
  const uid = c.req.param("uid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, pid),
        eq(schema.projectMembers.userId, user.id),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (uid === user.id) {
    return c.json({ error: "Cannot remove yourself" }, 400);
  }

  await db
    .delete(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, uid)));

  return c.json({ ok: true });
});

// List pending invitations for a project
projectRoutes.get("/projects/:pid/invitations", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return c.json({ error: "Not found" }, 404);
  }

  const now = new Date();
  const invitations = await db
    .select({
      id: schema.projectInvitations.id,
      email: schema.projectInvitations.email,
      invitedByUserName: schema.user.name,
      expiresAt: schema.projectInvitations.expiresAt,
      createdAt: schema.projectInvitations.createdAt,
    })
    .from(schema.projectInvitations)
    .innerJoin(schema.user, eq(schema.user.id, schema.projectInvitations.invitedByUserId))
    .where(and(
      eq(schema.projectInvitations.projectId, pid),
      gt(schema.projectInvitations.expiresAt, now),
    ))
    .orderBy(schema.projectInvitations.createdAt);

  return c.json(invitations);
});

// Create invitation (email-based invite)
projectRoutes.post("/projects/:pid/invitations", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, pid),
        eq(schema.projectMembers.userId, user.id),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{ email: string }>();
  if (!body.email?.trim()) {
    return c.json({ error: "Email is required" }, 400);
  }

  const existingMember = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, body.email)))
    .get();

  if (existingMember) {
    return c.json({ error: "User is already a member" }, 400);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const token = newId(32);

  await db.insert(schema.projectInvitations).values({
    id: newId(),
    projectId: pid,
    email: body.email.trim().toLowerCase(),
    invitedByUserId: user.id,
    token,
    expiresAt,
    createdAt: now,
  });

  const invitation = {
    id: newId(),
    email: body.email.trim().toLowerCase(),
    expiresAt,
    createdAt: now,
  };

  return c.json(invitation, 201);
});

// Accept invitation (creates account if user doesn't exist, then adds to project)
projectRoutes.post("/projects/invite/:token", async (c) => {
  const token = c.req.param("token");

  const invitation = await db
    .select({
      id: schema.projectInvitations.id,
      projectId: schema.projectInvitations.projectId,
      email: schema.projectInvitations.email,
      invitedByUserId: schema.projectInvitations.invitedByUserId,
      expiresAt: schema.projectInvitations.expiresAt,
      acceptedAt: schema.projectInvitations.acceptedAt,
    })
    .from(schema.projectInvitations)
    .where(eq(schema.projectInvitations.token, token))
    .get();

  if (!invitation) {
    return c.json({ error: "Invalid invitation" }, 404);
  }

  const now = new Date();
  if (lt(now, invitation.expiresAt)) {
    return c.json({ error: "Invitation expired" }, 400);
  }

  if (invitation.acceptedAt) {
    return c.json({ error: "Invitation already accepted" }, 400);
  }

  let userId = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, invitation.email))
    .get();

  if (!userId) {
    const newUser = await db
      .insert(schema.user)
      .values({
        id: newId(),
        name: invitation.email.split("@")[0],
        email: invitation.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.user.id })
      .get();

    userId = newUser[0];
  }

  const existingMembership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, invitation.projectId),
        eq(schema.projectMembers.userId, userId.id),
      ),
    )
    .get();

  if (!existingMembership) {
    await db.insert(schema.projectMembers).values({
      projectId: invitation.projectId,
      userId: userId.id,
      role: "member",
      joinedAt: now,
    });
  }

  await db
    .update(schema.projectInvitations)
    .set({ acceptedAt: now })
    .where(eq(schema.projectInvitations.id, invitation.id))
    .run();

  return c.json({ ok: true });
});

// Cancel invitation
projectRoutes.delete("/projects/:pid/invitations/:iid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");
  const iid = c.req.param("iid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, pid),
        eq(schema.projectMembers.userId, user.id),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const invitation = await db
    .select()
    .from(schema.projectInvitations)
    .where(eq(schema.projectInvitations.id, iid))
    .get();

  if (!invitation) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  await db.delete(schema.projectInvitations).where(eq(schema.projectInvitations.id, iid));

  return c.json({ ok: true });
});
