import { Hono } from "hono";
import { eq, and, desc, asc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";

export const sessionRoutes = new Hono();

// List sessions for a project
sessionRoutes.get("/projects/:pid/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  // Check membership
  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return c.json({ error: "Not found" }, 404);
  }

  const sessions = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.projectId, pid))
    .orderBy(desc(schema.retroSessions.sequence));

  return c.json(sessions);
});

// Create session
sessionRoutes.post("/projects/:pid/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  // Check membership
  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, pid), eq(schema.projectMembers.userId, user.id)))
    .get();

  if (!membership) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json<{ name: string }>();
  if (!body.name?.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }
  if (body.name.trim().length > 200) {
    return c.json({ error: "Name must be 200 characters or less" }, 400);
  }

  // Find the latest session to determine sequence and check for pending actions
  const latestSession = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.projectId, pid))
    .orderBy(desc(schema.retroSessions.sequence))
    .limit(1)
    .get();

  const sequence = latestSession ? latestSession.sequence + 1 : 1;

  // Check if previous session has actions that need review
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
    name: body.name.trim(),
    phase: initialPhase,
    sequence,
    createdBy: user.id,
    createdAt: new Date(),
    closedAt: null,
  };

  await db.insert(schema.retroSessions).values(session);
  return c.json(session, 201);
});

// Get session detail
sessionRoutes.get("/sessions/:sid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return c.json({ error: "Not found" }, 404);
  }

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(session);
});

// Get full session summary
sessionRoutes.get("/sessions/:sid/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) {
    return c.json({ error: "Not found" }, 404);
  }

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return c.json({ error: "Not found" }, 404);
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
      .innerJoin(schema.user, eq(schema.sessionParticipants.userId, schema.user.id))
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
    createdAt: Date;
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
        .innerJoin(schema.user, eq(schema.actionReviews.reviewerId, schema.user.id))
        .where(eq(schema.actionReviews.sessionId, sid))
        .orderBy(asc(schema.actionReviews.createdAt)),
    ]);

    const previousActionDescriptionById = new Map(
      previousActions.map((action) => [action.id, action.description]),
    );

    reviews = reviewRows.map((review) => ({
      ...review,
      actionDescription: previousActionDescriptionById.get(review.actionId) || "Previous action",
    }));
  }

  return c.json({
    session,
    participants,
    items: items.map((item) => ({
      ...item,
      voteCount: voteCountByItemId.get(item.id) || 0,
    })),
    bundles: bundles.map((bundle) => ({
      ...bundle,
      itemIds: itemIdsByBundleId.get(bundle.id) || [],
    })),
    actions,
    reviews,
  });
});

// Advance phase
sessionRoutes.patch("/sessions/:sid/phase", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) {
    return c.json({ error: "Not found" }, 404);
  }

  // Only creator can advance phase
  if (session.createdBy !== user.id) {
    return c.json({ error: "Only the session creator can advance phases" }, 403);
  }

  const transitions: Record<string, string> = {
    ideation: "action",
    action: "closed",
  };

  const nextPhase = transitions[session.phase];
  if (!nextPhase) {
    return c.json({ error: `Cannot advance from ${session.phase}` }, 400);
  }

  // Ideation → action requires at least 1 item
  if (session.phase === "ideation") {
    const itemCount = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.sessionId, sid));

    if (itemCount.length === 0) {
      return c.json({ error: "At least one item is required to advance" }, 400);
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
    return c.json({ error: "Not found" }, 404);
  }

  // Only project members can share
  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(eq(schema.projectMembers.projectId, session.projectId), eq(schema.projectMembers.userId, user.id)),
    )
    .get();

  if (!membership) {
    return c.json({ error: "Not found" }, 404);
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
    return c.json({ error: "Invalid or expired link" }, 404);
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

  return c.json({
    sessionId: session.id,
    sessionName: session.name,
    projectId: session.projectId,
    projectName: project?.name || "Unknown",
    phase: session.phase,
    isMember: !!membership,
  });
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
    return c.json({ error: "Invalid or expired link" }, 404);
  }

  // If already a project member, just return session info
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
    return c.json({ error: "Invalid or expired link" }, 404);
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
    return c.json({ error: "Not found" }, 404);
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
    .innerJoin(schema.user, eq(schema.sessionParticipants.userId, schema.user.id))
    .where(eq(schema.sessionParticipants.sessionId, sid));

  return c.json(participants);
});
