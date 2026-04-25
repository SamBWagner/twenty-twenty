import { Hono } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  createProjectBodySchema,
  invitationPreviewSchema,
  projectInvitationSchema,
  projectListItemSchema,
  projectSchema,
  updateProjectBodySchema,
} from "@twenty-twenty/shared";
import { db, runSqliteStatement, schema, tableHasColumn } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { jsonError, parseJsonBody, toIsoString } from "../lib/http.js";
import { getProjectMembers, getProjectView } from "../lib/views.js";

export const projectRoutes = new Hono();
let hasLegacyInvitationEmailColumn: boolean | null = null;

function invitationTableHasLegacyEmailColumn(): boolean {
  if (hasLegacyInvitationEmailColumn !== null) {
    return hasLegacyInvitationEmailColumn;
  }

  hasLegacyInvitationEmailColumn = tableHasColumn("project_invitations", "email");
  return hasLegacyInvitationEmailColumn;
}

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
    return { invitation: null, status: 404 as const, code: "not_found", message: "Invalid invitation." };
  }

  if (new Date() > new Date(invitation.expiresAt)) {
    return { invitation: null, status: 400 as const, code: "invitation_expired", message: "Invitation expired." };
  }

  return { invitation, status: 200 as const, code: null, message: null };
}

function serializeProject(project: typeof schema.projects.$inferSelect) {
  return projectSchema.parse({
    id: project.id,
    name: project.name,
    description: project.description,
    createdBy: project.createdBy,
    createdAt: toIsoString(project.createdAt),
    updatedAt: toIsoString(project.updatedAt),
  });
}

function serializeInvitation(invitation: {
  id: string;
  token: string;
  invitedByUserName: string;
  expiresAt: Date;
  createdAt: Date;
}) {
  return projectInvitationSchema.parse({
    id: invitation.id,
    token: invitation.token,
    invitedByUserName: invitation.invitedByUserName,
    expiresAt: toIsoString(invitation.expiresAt),
    createdAt: toIsoString(invitation.createdAt),
  });
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

  return c.json(memberships.map((membership) => projectListItemSchema.parse({
    ...serializeProject(membership.project),
    role: membership.role,
  })));
});

// Create project
projectRoutes.post("/projects", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = await parseJsonBody(c, createProjectBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const now = new Date();
  const project = {
    id: newId(),
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
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

  return c.json(serializeProject(project), 201);
});

projectRoutes.get("/projects/:pid/view", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");
  const view = await getProjectView(pid, user.id);

  if (!view) {
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  return c.json(view);
});

// Get project detail
projectRoutes.get("/projects/:pid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getProjectMembership(pid, user.id);
  if (!membership) {
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, pid)).get();
  if (!project) {
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  const members = await getProjectMembers(pid);

  return c.json({
    ...serializeProject(project),
    members,
  });
});

// Update project
projectRoutes.patch("/projects/:pid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getOwnerMembership(pid, user.id);
  if (!membership) {
    return jsonError(c, 403, "forbidden", "Only project owners can update a project.");
  }

  const parsed = await parseJsonBody(c, updateProjectBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name?.trim()) updates.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description?.trim() || null;

  await db.update(schema.projects).set(updates).where(eq(schema.projects.id, pid));
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, pid)).get();

  return c.json(serializeProject(project!));
});

// Delete project
projectRoutes.delete("/projects/:pid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getOwnerMembership(pid, user.id);
  if (!membership) {
    return jsonError(c, 403, "forbidden", "Only project owners can delete a project.");
  }

  const members = await db
    .select({
      userId: schema.projectMembers.userId,
    })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.projectId, pid));

  if (members.length !== 1 || members[0]?.userId !== user.id) {
    return jsonError(c, 400, "project_not_empty", "Kick everyone else from the project before deleting it.");
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
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  return c.json(await getProjectMembers(pid));
});

// Add member (by user ID — frontend resolves GitHub username to user)
projectRoutes.post("/projects/:pid/members", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getOwnerMembership(pid, user.id);
  if (!membership) {
    return jsonError(c, 403, "forbidden", "Only project owners can add members.");
  }

  const body = await c.req.json<{ userId: string }>().catch(() => null);
  if (!body?.userId) {
    return jsonError(c, 400, "validation_error", "A userId is required.");
  }

  const targetUser = await db.select().from(schema.user).where(eq(schema.user.id, body.userId)).get();
  if (!targetUser) {
    return jsonError(c, 404, "not_found", "User not found.");
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
    return jsonError(c, 403, "forbidden", "Only project owners can remove members.");
  }

  const targetMembership = await getProjectMembership(pid, uid);
  if (!targetMembership) {
    return jsonError(c, 404, "not_found", "Member not found.");
  }

  if (targetMembership.userId === user.id) {
    return jsonError(c, 400, "invalid_request", "You cannot remove yourself.");
  }

  if (targetMembership.role === "owner") {
    return jsonError(c, 400, "invalid_request", "Owners cannot be removed.");
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
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  if (membership.role === "owner") {
    return jsonError(c, 400, "invalid_request", "Owners can't leave their project yet.");
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
    return jsonError(c, invitationResult.status, invitationResult.code!, invitationResult.message!);
  }

  const membership = await getProjectMembership(invitationResult.invitation.projectId, user.id);

  return c.json(invitationPreviewSchema.parse({
    projectId: invitationResult.invitation.projectId,
    projectName: invitationResult.invitation.projectName,
    projectDescription: invitationResult.invitation.projectDescription,
    invitedByUserName: invitationResult.invitation.invitedByUserName,
    expiresAt: toIsoString(invitationResult.invitation.expiresAt),
    isMember: Boolean(membership),
  }));
});

// Join project via shareable invitation link
projectRoutes.post("/projects/invite/:token", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");

  const invitationResult = await getInvitationWithProject(token);
  if (!invitationResult.invitation) {
    return jsonError(c, invitationResult.status, invitationResult.code!, invitationResult.message!);
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
    return jsonError(c, 403, "forbidden", "Only project owners can view invitations.");
  }

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
      gt(schema.projectInvitations.expiresAt, new Date()),
    ))
    .orderBy(desc(schema.projectInvitations.createdAt));

  return c.json(invitations.map(serializeInvitation));
});

// Create shareable invitation link
projectRoutes.post("/projects/:pid/invitations", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await getOwnerMembership(pid, user.id);
  if (!membership) {
    return jsonError(c, 403, "forbidden", "Only project owners can create invitations.");
  }

  const now = new Date();
  const invitation = {
    id: newId(),
    projectId: pid,
    invitedByUserId: user.id,
    token: newId(32),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
  };

  if (invitationTableHasLegacyEmailColumn()) {
    runSqliteStatement(
      `
        INSERT INTO project_invitations
          (id, project_id, invited_by_user_id, token, email, expires_at, created_at)
        VALUES
          (@id, @projectId, @invitedByUserId, @token, @email, @expiresAt, @createdAt)
      `,
      {
        id: invitation.id,
        projectId: invitation.projectId,
        invitedByUserId: invitation.invitedByUserId,
        token: invitation.token,
        email: user.email || `invite+${invitation.id}@local.invalid`,
        expiresAt: invitation.expiresAt.getTime() / 1000,
        createdAt: invitation.createdAt.getTime(),
      },
    );
  } else {
    await db.insert(schema.projectInvitations).values(invitation);
  }

  return c.json(serializeInvitation({
    id: invitation.id,
    token: invitation.token,
    invitedByUserName: user.name,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  }), 201);
});

// Revoke invitation
projectRoutes.delete("/projects/:pid/invitations/:iid", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");
  const iid = c.req.param("iid");

  const membership = await getOwnerMembership(pid, user.id);
  if (!membership) {
    return jsonError(c, 403, "forbidden", "Only project owners can revoke invitations.");
  }

  const invitation = await db
    .select()
    .from(schema.projectInvitations)
    .where(and(eq(schema.projectInvitations.id, iid), eq(schema.projectInvitations.projectId, pid)))
    .get();

  if (!invitation) {
    return jsonError(c, 404, "not_found", "Invitation not found.");
  }

  await db
    .delete(schema.projectInvitations)
    .where(and(eq(schema.projectInvitations.id, iid), eq(schema.projectInvitations.projectId, pid)));

  return c.json({ ok: true });
});
