import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { actionReviewSchema, submitReviewBodySchema } from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { jsonError, parseJsonBody, toIsoString } from "../lib/http.js";
import { getReviewStateForSession } from "../lib/views.js";

export const reviewRoutes = new Hono();

// Get pending reviews (previous session's unreviewed actions)
reviewRoutes.get("/sessions/:sid/reviews/pending", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");

  return c.json(await getReviewStateForSession(session));
});

// Submit a review
reviewRoutes.post("/sessions/:sid/reviews", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "review") return jsonError(c, 400, "invalid_phase", "Reviews are only available during the review phase.");

  const parsed = await parseJsonBody(c, submitReviewBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }
  if (parsed.data.status === "disagree" && !parsed.data.comment?.trim()) {
    return jsonError(c, 400, "validation_error", "A comment is required when disagreeing.");
  }

  // Check action exists and belongs to previous session
  const action = await db.select().from(schema.actions).where(eq(schema.actions.id, parsed.data.actionId)).get();
  if (!action) return jsonError(c, 404, "not_found", "Action not found.");

  // Create review
  const review = {
    id: newId(),
    actionId: parsed.data.actionId,
    sessionId: sid,
    reviewerId: user.id,
    status: parsed.data.status,
    comment: parsed.data.comment?.trim() || null,
    createdAt: new Date(),
  };

  await db.insert(schema.actionReviews).values(review);

  // If "did_nothing", roll the action into this session
  if (parsed.data.status === "did_nothing") {
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

  return c.json(actionReviewSchema.parse({
    id: review.id,
    actionId: review.actionId,
    sessionId: review.sessionId,
    reviewerId: review.reviewerId,
    status: review.status,
    comment: review.comment,
    createdAt: toIsoString(review.createdAt),
  }), 201);
});

// Get all reviews for this session
reviewRoutes.get("/sessions/:sid/reviews", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const reviews = await db
    .select()
    .from(schema.actionReviews)
    .where(eq(schema.actionReviews.sessionId, sid));

  return c.json(reviews.map((review) => actionReviewSchema.parse({
    id: review.id,
    actionId: review.actionId,
    sessionId: review.sessionId,
    reviewerId: review.reviewerId,
    status: review.status,
    comment: review.comment,
    createdAt: toIsoString(review.createdAt),
  })));
});
