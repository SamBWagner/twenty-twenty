import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";

export const reviewRoutes = new Hono();

// Get pending reviews (previous session's unreviewed actions)
reviewRoutes.get("/sessions/:sid/reviews/pending", requireAuth, async (c) => {
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);

  // Find previous session
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

  if (!previousSession) return c.json([]);

  // Get actions from previous session
  const previousActions = await db
    .select()
    .from(schema.actions)
    .where(eq(schema.actions.sessionId, previousSession.id));

  // Get existing reviews for this session
  const existingReviews = await db
    .select()
    .from(schema.actionReviews)
    .where(eq(schema.actionReviews.sessionId, sid));

  const reviewedActionIds = new Set(existingReviews.map((r) => r.actionId));

  // Return unreviewed actions with their bundle context
  const pending = previousActions.filter((a) => !reviewedActionIds.has(a.id));

  return c.json({
    actions: previousActions,
    reviews: existingReviews,
    pending,
    total: previousActions.length,
    reviewed: existingReviews.length,
  });
});

// Submit a review
reviewRoutes.post("/sessions/:sid/reviews", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "review") return c.json({ error: "Reviews only during review phase" }, 400);

  const body = await c.req.json<{
    actionId: string;
    status: "did_nothing" | "actioned" | "disagree";
    comment?: string;
  }>();

  if (!["did_nothing", "actioned", "disagree"].includes(body.status)) {
    return c.json({ error: "Invalid status" }, 400);
  }
  if (body.status === "disagree" && !body.comment?.trim()) {
    return c.json({ error: "Comment required when disagreeing" }, 400);
  }

  // Check action exists and belongs to previous session
  const action = await db.select().from(schema.actions).where(eq(schema.actions.id, body.actionId)).get();
  if (!action) return c.json({ error: "Action not found" }, 404);

  // Create review
  const review = {
    id: newId(),
    actionId: body.actionId,
    sessionId: sid,
    reviewerId: user.id,
    status: body.status,
    comment: body.comment?.trim() || null,
    createdAt: new Date(),
  };

  await db.insert(schema.actionReviews).values(review);

  // If "did_nothing", roll the action into this session
  if (body.status === "did_nothing") {
    const rolledAction = {
      id: newId(),
      sessionId: sid,
      bundleId: null,
      description: action.description,
      assigneeId: action.assigneeId,
      createdAt: new Date(),
    };
    await db.insert(schema.actions).values(rolledAction);
  }

  // Check if all actions are now reviewed — auto-advance to ideation
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

  if (previousSession) {
    const totalActions = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, previousSession.id));

    const totalReviews = await db
      .select()
      .from(schema.actionReviews)
      .where(eq(schema.actionReviews.sessionId, sid));

    if (totalReviews.length >= totalActions.length) {
      // All reviewed — advance to ideation
      await db
        .update(schema.retroSessions)
        .set({ phase: "ideation" })
        .where(eq(schema.retroSessions.id, sid));

      broadcast(sid, { type: "phase:changed", payload: { phase: "ideation" } });
    }
  }

  return c.json(review, 201);
});

// Get all reviews for this session
reviewRoutes.get("/sessions/:sid/reviews", requireAuth, async (c) => {
  const sid = c.req.param("sid");

  const reviews = await db
    .select()
    .from(schema.actionReviews)
    .where(eq(schema.actionReviews.sessionId, sid));

  return c.json(reviews);
});
