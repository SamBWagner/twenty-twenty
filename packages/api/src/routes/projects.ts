import { Hono } from "hono";
import { eq, and, gt, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";

export const projectRoutes = new Hono();

async function getProjectMembership(projectId: string, userId: string) {
  return db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, userId)))
    .get();
}

async function getOwnerMembership(projectId: string, userId: string) {
  return db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, projectId),
        eq(schema.projectMembers.userId, userId),
        eq(schema.projectMembers.role, "owner"),
      ),
    )
    .get();
}

async function getInvitationWithProject(token: string) {
  const invitation = await db
    .select({
      id: schema.projectInvitations.id,
      projectId: schema.projectInvitations.projectId,
      projectName: schema.projects.name,
      projectDescription: schema.projects.description,
      invitedByUserName: schema.user.name,
      expiresAt: schema.projectInvitations.expiresAt,
    })
    .from(schema.projectInvitations)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectInvitations.projectId))
    .innerJoin(schema.user, eq(schema.user.id, schema.projectInvitations.invitedByUserId))
    .where(eq(schema.projectInvitations.token, token))
    .get();

  if (!invitation) {
    return { invitation: null, status: 404 as const, error: "Invalid invitation" };
  }

  if (new Date() > new Date(invitation.expiresAt)) {
    return { invitation: null, status: 400 as const, error: "Invitation expired" };
  }

  return { invitation, status: 200 as const, error: null };
}

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
  if (body.name.trim().length > 200) {
    return c.json({ error: "Name must be 200 characters or less" }, 400);
  }
  if (body.description && body.description.trim().length > 2000) {
    return c.json({ error: "Description must be 2000 characters or less" }, 400);
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

  const membership = await getProjectMembership(pid, user.id);

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

  const membership = await getOwnerMembership(pid, user.id);

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{ name?: string; description?: string }>();
  if (body.name && body.name.trim().length > 200) {
    return c.json({ error: "Name must be 200 characters or less" }, 400);
  }
  if (body.description && body.description.trim().length > 2000) {
    return c.json({ error: "Description must be 2000 characters or less" }, 400);
  }
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

  const membership = await getOwnerMembership(pid, user.id);

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const members = await db
    .select({
      userId: schema.projectMembers.userId,
    })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.projectId, pid));

  if (members.length !== 1 || members[0]?.userId !== user.id) {
    return c.json({ error: "Kick everyone else from the project before deleting it." }, 400);
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, pid));
  return c.json({ ok: true });
});

// List members
projectRoutes.get("/projects/:pid/members", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getProjectMembership(pid, user.id);

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

  const membership = await getOwnerMembership(pid, user.id);

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

  const membership = await getOwnerMembership(pid, user.id);

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetMembership = await getProjectMembership(pid, uid);

  if (!targetMembership) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (targetMembership.userId === user.id) {
    return c.json({ error: "Cannot remove yourself" }, 400);
  }

  if (targetMembership.role === "owner") {
    return c.json({ error: "Owners cannot be removed" }, 400);
  }

  await db
    .delete(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, targetMembership.userId)));

  return c.json({ ok: true });
});

// Leave project
projectRoutes.delete("/projects/:pid/membership", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getProjectMembership(pid, user.id);
  if (!membership) {
    return c.json({ error: "Not found" }, 404);
  }

  if (membership.role === "owner") {
    return c.json({ error: "Owners can't leave their project yet" }, 400);
  }

  await db
    .delete(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)));

  return c.json({ ok: true });
});

// Preview project invitation
projectRoutes.get("/projects/invite/:token", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");

  const invitationResult = await getInvitationWithProject(token);
  if (!invitationResult.invitation) {
    return c.json({ error: invitationResult.error }, invitationResult.status);
  }

  const membership = await getProjectMembership(invitationResult.invitation.projectId, user.id);

  return c.json({
    projectId: invitationResult.invitation.projectId,
    projectName: invitationResult.invitation.projectName,
    projectDescription: invitationResult.invitation.projectDescription,
    invitedByUserName: invitationResult.invitation.invitedByUserName,
    expiresAt: invitationResult.invitation.expiresAt,
    isMember: !!membership,
  });
});

// Join project via shareable invitation link
projectRoutes.post("/projects/invite/:token", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");

  const invitationResult = await getInvitationWithProject(token);
  if (!invitationResult.invitation) {
    return c.json({ error: invitationResult.error }, invitationResult.status);
  }

  await db
    .insert(schema.projectMembers)
    .values({
      projectId: invitationResult.invitation.projectId,
      userId: user.id,
      role: "member",
      joinedAt: new Date(),
    })
    .onConflictDoNothing();

  return c.json({ ok: true, projectId: invitationResult.invitation.projectId });
});

// List active invitation links for a project
projectRoutes.get("/projects/:pid/invitations", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getOwnerMembership(pid, user.id);

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const now = new Date();
  const invitations = await db
    .select({
      id: schema.projectInvitations.id,
      token: schema.projectInvitations.token,
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
    .orderBy(desc(schema.projectInvitations.createdAt));

  return c.json(invitations);
});

// Create shareable invitation link
projectRoutes.post("/projects/:pid/invitations", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getOwnerMembership(pid, user.id);

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const now = new Date();
  const invitationId = newId();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const token = newId(32);

  await db.insert(schema.projectInvitations).values({
    id: invitationId,
    projectId: pid,
    invitedByUserId: user.id,
    token,
    expiresAt,
    createdAt: now,
  });

  return c.json(
    {
      id: invitationId,
      token,
      invitedByUserName: user.name,
      expiresAt,
      createdAt: now,
    },
    201,
  );
});

// Revoke invitation
projectRoutes.delete("/projects/:pid/invitations/:iid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");
  const iid = c.req.param("iid");

  const membership = await getOwnerMembership(pid, user.id);
  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const invitation = await db
    .select()
    .from(schema.projectInvitations)
    .where(and(eq(schema.projectInvitations.id, iid), eq(schema.projectInvitations.projectId, pid)))
    .get();

  if (!invitation) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  await db
    .delete(schema.projectInvitations)
    .where(and(eq(schema.projectInvitations.id, iid), eq(schema.projectInvitations.projectId, pid)));

  return c.json({ ok: true });
});
