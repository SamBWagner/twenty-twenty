import { Hono } from "hono";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import {
  createSessionBodySchema,
  retroSessionSchema,
  sessionParticipantSchema,
  sharePreviewSchema,
} from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { getSessionSummary, getSessionView, getSharedSessionSummaryByToken } from "../lib/views.js";
import { jsonError, parseJsonBody, toIsoString, toNullableIsoString } from "../lib/http.js";

export const sessionRoutes = new Hono();

function serializeSession(session: typeof schema.retroSessions.$inferSelect) {
  return retroSessionSchema.parse({
    id: session.id,
    projectId: session.projectId,
    name: session.name,
    phase: session.phase,
    sequence: session.sequence,
    createdBy: session.createdBy,
    createdAt: toIsoString(session.createdAt),
    closedAt: toNullableIsoString(session.closedAt),
  });
}

function serializeParticipant(participant: {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: "member" | "guest";
  joinedAt: Date;
}) {
  return sessionParticipantSchema.parse({
    userId: participant.userId,
    username: participant.username,
    avatarUrl: participant.avatarUrl,
    role: participant.role,
    joinedAt: toIsoString(participant.joinedAt),
  });
}

// List sessions for a project
sessionRoutes.get("/projects/:pid/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  const sessions = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.projectId, pid))
    .orderBy(desc(schema.retroSessions.sequence));

  return c.json(sessions.map(serializeSession));
});

// Create session
sessionRoutes.post("/projects/:pid/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return jsonError(c, 404, "not_found", "Project not found.");
  }

  const parsed = await parseJsonBody(c, createSessionBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const latestSession = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.projectId, pid))
    .orderBy(desc(schema.retroSessions.sequence))
    .limit(1)
    .get();

  const sequence = latestSession ? latestSession.sequence + 1 : 1;

  let initialPhase: "review" | "ideation" = "ideation";
  if (latestSession) {
    const previousActions = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, latestSession.id));

    if (previousActions.length > 0) {
      initialPhase = "review";
    }
  }

  const session = {
    id: newId(),
    projectId: pid,
    name: parsed.data.name.trim(),
    phase: initialPhase,
    sequence,
    createdBy: user.id,
    createdAt: new Date(),
    closedAt: null,
    shareToken: null,
    summaryShareToken: null,
  };

  await db.insert(schema.retroSessions).values(session);
  return c.json(serializeSession(session), 201);
});

sessionRoutes.get("/sessions/:sid/view", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const view = await getSessionView(sid, user.id);

  if (!view) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  return c.json(view);
});

// Get session detail
sessionRoutes.get("/sessions/:sid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  return c.json(serializeSession(session));
});

// Get full session summary
sessionRoutes.get("/sessions/:sid/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const summary = await getSessionSummary(sid);
  if (!summary) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  return c.json(summary);
});

// Advance phase
sessionRoutes.patch("/sessions/:sid/phase", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  if (session.createdBy !== user.id) {
    return jsonError(c, 403, "forbidden", "Only the session creator can advance phases.");
  }

  const transitions: Record<string, "action" | "closed" | undefined> = {
    ideation: "action",
    action: "closed",
  };

  const nextPhase = transitions[session.phase];
  if (!nextPhase) {
    return jsonError(c, 400, "invalid_phase", `Cannot advance from ${session.phase}.`);
  }

  if (session.phase === "ideation") {
    const itemCount = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.sessionId, sid));

    if (itemCount.length === 0) {
      return jsonError(c, 400, "invalid_request", "At least one item is required to advance.");
    }
  }

  if (session.phase === "action") {
    const actionCount = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, sid));

    if (actionCount.length === 0) {
      return jsonError(c, 400, "invalid_request", "At least one action is required to close the session.");
    }
  }

  const updates: Record<string, unknown> = { phase: nextPhase };
  if (nextPhase === "closed") {
    updates.closedAt = new Date();
  }

  await db.update(schema.retroSessions).set(updates).where(eq(schema.retroSessions.id, sid));

  broadcast(sid, { type: "phase:changed", payload: { phase: nextPhase } });

  return c.json({ phase: nextPhase });
});

// Generate share token
sessionRoutes.post("/sessions/:sid/share", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(eq(schema.projectMembers.projectId, session.projectId), eq(schema.projectMembers.userId, user.id)),
    )
    .get();

  if (!membership) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  if (session.shareToken) {
    return c.json({ shareToken: session.shareToken });
  }

  const shareToken = newId(24);
  await db
    .update(schema.retroSessions)
    .set({ shareToken })
    .where(eq(schema.retroSessions.id, sid));

  return c.json({ shareToken });
});

sessionRoutes.post("/sessions/:sid/summary-share", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(eq(schema.projectMembers.projectId, session.projectId), eq(schema.projectMembers.userId, user.id)),
    )
    .get();

  if (!membership) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  if (session.phase !== "closed") {
    return jsonError(c, 400, "invalid_phase", "Only closed sessions can be shared as summaries.");
  }

  if (session.summaryShareToken) {
    return c.json({ summaryShareToken: session.summaryShareToken });
  }

  const summaryShareToken = newId(24);
  await db
    .update(schema.retroSessions)
    .set({ summaryShareToken })
    .where(eq(schema.retroSessions.id, sid));

  return c.json({ summaryShareToken });
});

// Validate share token (get session info before joining)
sessionRoutes.get("/sessions/join/:token", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");

  const session = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.shareToken, token))
    .get();

  if (!session) {
    return jsonError(c, 404, "not_found", "Invalid or expired link.");
  }

  const project = await db
    .select({ name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, session.projectId))
    .get();

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(eq(schema.projectMembers.projectId, session.projectId), eq(schema.projectMembers.userId, user.id)),
    )
    .get();

  return c.json(sharePreviewSchema.parse({
    sessionId: session.id,
    sessionName: session.name,
    projectId: session.projectId,
    projectName: project?.name || "Unknown",
    phase: session.phase,
    isMember: Boolean(membership),
  }));
});

// Join session as guest
sessionRoutes.post("/sessions/join/:token", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");

  const session = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.shareToken, token))
    .get();

  if (!session) {
    return jsonError(c, 404, "not_found", "Invalid or expired link.");
  }

  if (session.phase === "closed") {
    return jsonError(c, 400, "invalid_phase", "This retrospective is closed and can no longer be joined.");
  }

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(eq(schema.projectMembers.projectId, session.projectId), eq(schema.projectMembers.userId, user.id)),
    )
    .get();

  const role = membership ? "member" : "guest";

  await db
    .insert(schema.sessionParticipants)
    .values({
      sessionId: session.id,
      userId: user.id,
      role,
      joinedAt: new Date(),
    })
    .onConflictDoNothing();

  return c.json({ sessionId: session.id, projectId: session.projectId });
});

// Join project permanently via share token
sessionRoutes.post("/sessions/join/:token/project", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");

  const session = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.shareToken, token))
    .get();

  if (!session) {
    return jsonError(c, 404, "not_found", "Invalid or expired link.");
  }

  if (session.phase === "closed") {
    return jsonError(c, 400, "invalid_phase", "This retrospective is closed and can no longer be joined.");
  }

  await db
    .insert(schema.projectMembers)
    .values({
      projectId: session.projectId,
      userId: user.id,
      role: "member",
      joinedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(schema.sessionParticipants)
    .values({
      sessionId: session.id,
      userId: user.id,
      role: "member",
      joinedAt: new Date(),
    })
    .onConflictDoNothing();

  return c.json({ sessionId: session.id, projectId: session.projectId });
});

sessionRoutes.get("/sessions/summary-share/:token", async (c) => {
  const token = c.req.param("token");
  const summary = await getSharedSessionSummaryByToken(token);

  if (!summary) {
    return jsonError(c, 404, "not_found", "Invalid or expired summary link.");
  }

  return c.json(summary);
});

// Get session participants (who attended)
sessionRoutes.get("/sessions/:sid/participants", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const session = await db
    .select({ closedAt: schema.retroSessions.closedAt })
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.id, sid))
    .get();

  if (!session) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const participantFilter = session.closedAt
    ? and(
      eq(schema.sessionParticipants.sessionId, sid),
      lte(schema.sessionParticipants.joinedAt, session.closedAt),
    )
    : eq(schema.sessionParticipants.sessionId, sid);

  const participants = await db
    .select({
      userId: schema.sessionParticipants.userId,
      username: schema.user.name,
      avatarUrl: schema.user.image,
      role: schema.sessionParticipants.role,
      joinedAt: schema.sessionParticipants.joinedAt,
    })
    .from(schema.sessionParticipants)
    .innerJoin(schema.user, eq(schema.user.id, schema.sessionParticipants.userId))
    .where(participantFilter);

  return c.json(participants.map(serializeParticipant));
});
