import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  actionSchema,
  bundleSchema,
  createSessionBodySchema,
  retroSessionSchema,
  sessionParticipantSchema,
  sessionSummarySchema,
  sharePreviewSchema,
} from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { getReviewStateForSession, getSessionView } from "../lib/views.js";
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

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

  const [participants, items, bundles, actions] = await Promise.all([
    db
      .select({
        userId: schema.sessionParticipants.userId,
        username: schema.user.name,
        avatarUrl: schema.user.image,
        role: schema.sessionParticipants.role,
        joinedAt: schema.sessionParticipants.joinedAt,
      })
      .from(schema.sessionParticipants)
      .innerJoin(schema.user, eq(schema.user.id, schema.sessionParticipants.userId))
      .where(eq(schema.sessionParticipants.sessionId, sid))
      .orderBy(asc(schema.sessionParticipants.joinedAt)),
    db
      .select()
      .from(schema.items)
      .where(eq(schema.items.sessionId, sid))
      .orderBy(asc(schema.items.createdAt)),
    db
      .select()
      .from(schema.bundles)
      .where(eq(schema.bundles.sessionId, sid))
      .orderBy(asc(schema.bundles.createdAt)),
    db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, sid))
      .orderBy(asc(schema.actions.createdAt)),
  ]);

  const [voteRows, bundleLinks] = await Promise.all([
    db
      .select({
        itemId: schema.votes.itemId,
        value: schema.votes.value,
      })
      .from(schema.votes)
      .innerJoin(schema.items, eq(schema.votes.itemId, schema.items.id))
      .where(eq(schema.items.sessionId, sid)),
    db
      .select({
        bundleId: schema.bundleItems.bundleId,
        itemId: schema.bundleItems.itemId,
      })
      .from(schema.bundleItems)
      .innerJoin(schema.bundles, eq(schema.bundleItems.bundleId, schema.bundles.id))
      .where(eq(schema.bundles.sessionId, sid)),
  ]);

  const voteCountByItemId = new Map<string, number>();
  for (const vote of voteRows) {
    voteCountByItemId.set(vote.itemId, (voteCountByItemId.get(vote.itemId) || 0) + vote.value);
  }

  const itemIdsByBundleId = new Map<string, string[]>();
  for (const link of bundleLinks) {
    const itemIds = itemIdsByBundleId.get(link.bundleId) || [];
    itemIds.push(link.itemId);
    itemIdsByBundleId.set(link.bundleId, itemIds);
  }

  const previousSession = await db
    .select()
    .from(schema.retroSessions)
    .where(
      and(
        eq(schema.retroSessions.projectId, session.projectId),
        eq(schema.retroSessions.sequence, session.sequence - 1),
      ),
    )
    .get();

  let reviews: Array<{
    actionId: string;
    actionDescription: string;
    reviewerId: string;
    reviewerName: string;
    status: "did_nothing" | "actioned" | "disagree";
    comment: string | null;
    createdAt: string;
  }> = [];

  if (previousSession) {
    const [previousActions, reviewRows] = await Promise.all([
      db
        .select({
          id: schema.actions.id,
          description: schema.actions.description,
        })
        .from(schema.actions)
        .where(eq(schema.actions.sessionId, previousSession.id)),
      db
        .select({
          actionId: schema.actionReviews.actionId,
          reviewerId: schema.actionReviews.reviewerId,
          reviewerName: schema.user.name,
          status: schema.actionReviews.status,
          comment: schema.actionReviews.comment,
          createdAt: schema.actionReviews.createdAt,
        })
        .from(schema.actionReviews)
        .innerJoin(schema.user, eq(schema.user.id, schema.actionReviews.reviewerId))
        .where(eq(schema.actionReviews.sessionId, sid))
        .orderBy(asc(schema.actionReviews.createdAt)),
    ]);

    const previousActionDescriptionById = new Map(
      previousActions.map((action) => [action.id, action.description]),
    );

    reviews = reviewRows.map((review) => ({
      ...review,
      actionDescription: previousActionDescriptionById.get(review.actionId) || "Previous action",
      createdAt: toIsoString(review.createdAt),
    }));
  }

  return c.json(sessionSummarySchema.parse({
    session: serializeSession(session),
    participants: participants.map(serializeParticipant),
    items: items.map((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      authorId: item.authorId,
      type: item.type,
      content: item.content,
      createdAt: toIsoString(item.createdAt),
      voteCount: voteCountByItemId.get(item.id) || 0,
    })),
    bundles: bundles.map((bundle) => bundleSchema.parse({
      id: bundle.id,
      sessionId: bundle.sessionId,
      label: bundle.label,
      createdAt: toIsoString(bundle.createdAt),
      itemIds: itemIdsByBundleId.get(bundle.id) || [],
    })),
    actions: actions.map((action) => actionSchema.parse({
      id: action.id,
      sessionId: action.sessionId,
      bundleId: action.bundleId,
      description: action.description,
      assigneeId: action.assigneeId,
      createdAt: toIsoString(action.createdAt),
    })),
    reviews,
  }));
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

// Get session participants (who attended)
sessionRoutes.get("/sessions/:sid/participants", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return jsonError(c, 404, "not_found", "Session not found.");
  }

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
    .where(eq(schema.sessionParticipants.sessionId, sid));

  return c.json(participants.map(serializeParticipant));
});
