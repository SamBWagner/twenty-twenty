import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
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
