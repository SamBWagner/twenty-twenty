import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  actionReviewSchema,
  actionReviewVoteSchema,
  finalizeReviewBodySchema,
  submitReviewVoteBodySchema,
  type ReviewTally,
} from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { jsonError, parseJsonBody, toIsoString } from "../lib/http.js";
import { getReviewStateForSession } from "../lib/views.js";

export const reviewRoutes = new Hono();

type ReviewStatus = "did_nothing" | "actioned" | "disagree";

function serializeReview(review: typeof schema.actionReviews.$inferSelect) {
  const actioned = review.actionedVoteCount || 0;
  const didNothing = review.didNothingVoteCount || 0;
  const disagree = review.disagreeVoteCount || 0;

  return actionReviewSchema.parse({
    id: review.id,
    actionId: review.actionId,
    sessionId: review.sessionId,
    reviewerId: review.reviewerId,
    status: review.status,
    comment: review.comment,
    tally: {
      actioned,
      didNothing,
      disagree,
      total: actioned + didNothing + disagree,
    },
    createdAt: toIsoString(review.createdAt),
  });
}

function serializeVote(vote: typeof schema.actionReviewVotes.$inferSelect) {
  return actionReviewVoteSchema.parse({
    id: vote.id,
    actionId: vote.actionId,
    sessionId: vote.sessionId,
    voterId: vote.voterId,
    status: vote.status,
    comment: vote.comment,
    createdAt: toIsoString(vote.createdAt),
    updatedAt: toIsoString(vote.updatedAt),
  });
}

function tallyVotes(votes: Array<{ status: ReviewStatus }>): ReviewTally {
  const actioned = votes.filter((vote) => vote.status === "actioned").length;
  const didNothing = votes.filter((vote) => vote.status === "did_nothing").length;
  const disagree = votes.filter((vote) => vote.status === "disagree").length;

  return {
    actioned,
    didNothing,
    disagree,
    total: actioned + didNothing + disagree,
  };
}

function getTopStatuses(tally: ReviewTally): ReviewStatus[] {
  const entries: Array<[ReviewStatus, number]> = [
    ["actioned", tally.actioned],
    ["did_nothing", tally.didNothing],
    ["disagree", tally.disagree],
  ];
  const topCount = Math.max(...entries.map(([, count]) => count));
  if (topCount === 0) return [];
  return entries.filter(([, count]) => count === topCount).map(([status]) => status);
}

function buildFinalComment(status: ReviewStatus, votes: Array<{ status: ReviewStatus; comment: string | null }>) {
  if (status !== "disagree") return null;

  const comments = votes
    .filter((vote) => vote.status === "disagree" && vote.comment?.trim())
    .map((vote) => vote.comment!.trim());

  return comments.length > 0 ? comments.join("\n") : null;
}

async function getSessionForReview(userId: string, sid: string) {
  const access = await canAccessSession(userId, sid);
  if (!access.allowed) return null;

  return db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
}

async function getReviewableAction(session: typeof schema.retroSessions.$inferSelect, actionId: string) {
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

  if (!previousSession) return null;

  const action = await db
    .select()
    .from(schema.actions)
    .where(and(eq(schema.actions.id, actionId), eq(schema.actions.sessionId, previousSession.id)))
    .get();

  return action || null;
}

async function getVotesForAction(sessionId: string, actionId: string) {
  return db
    .select()
    .from(schema.actionReviewVotes)
    .where(and(eq(schema.actionReviewVotes.sessionId, sessionId), eq(schema.actionReviewVotes.actionId, actionId)));
}

async function getExistingFinalReview(sessionId: string, actionId: string) {
  return db
    .select()
    .from(schema.actionReviews)
    .where(and(eq(schema.actionReviews.sessionId, sessionId), eq(schema.actionReviews.actionId, actionId)))
    .get();
}

async function maybeAdvanceToIdeation(session: typeof schema.retroSessions.$inferSelect) {
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

  if (!previousSession) return false;

  const totalActions = await db
    .select()
    .from(schema.actions)
    .where(eq(schema.actions.sessionId, previousSession.id));

  const totalReviews = await db
    .select()
    .from(schema.actionReviews)
    .where(eq(schema.actionReviews.sessionId, session.id));

  if (totalReviews.length < totalActions.length) return false;

  await db
    .update(schema.retroSessions)
    .set({ phase: "ideation" })
    .where(and(eq(schema.retroSessions.id, session.id), eq(schema.retroSessions.phase, "review")));

  return true;
}

// Get pending reviews (previous session's unreviewed actions)
reviewRoutes.get("/sessions/:sid/reviews/pending", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await getSessionForReview(user.id, sid);
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");

  return c.json(await getReviewStateForSession(session, user.id));
});

// Cast or change a review vote. This does not finalize the action outcome.
reviewRoutes.post("/sessions/:sid/reviews/votes", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await getSessionForReview(user.id, sid);
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "review") {
    return jsonError(c, 400, "invalid_phase", "Review voting is only available during the review phase.");
  }

  const parsed = await parseJsonBody(c, submitReviewVoteBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }
  if (parsed.data.status === "disagree" && !parsed.data.comment?.trim()) {
    return jsonError(c, 400, "validation_error", "A comment is required when disagreeing.");
  }

  const action = await getReviewableAction(session, parsed.data.actionId);
  if (!action) return jsonError(c, 404, "not_found", "Action not found.");

  const existingFinalReview = await getExistingFinalReview(sid, action.id);
  if (existingFinalReview) {
    return jsonError(c, 400, "already_finalized", "This action review has already been accepted.");
  }

  const now = new Date();
  await db
    .insert(schema.actionReviewVotes)
    .values({
      id: newId(),
      actionId: action.id,
      sessionId: sid,
      voterId: user.id,
      status: parsed.data.status,
      comment: parsed.data.comment?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.actionReviewVotes.sessionId,
        schema.actionReviewVotes.actionId,
        schema.actionReviewVotes.voterId,
      ],
      set: {
        status: parsed.data.status,
        comment: parsed.data.comment?.trim() || null,
        updatedAt: now,
      },
    });

  const [vote, votes] = await Promise.all([
    db
      .select()
      .from(schema.actionReviewVotes)
      .where(
        and(
          eq(schema.actionReviewVotes.sessionId, sid),
          eq(schema.actionReviewVotes.actionId, action.id),
          eq(schema.actionReviewVotes.voterId, user.id),
        ),
      )
      .get(),
    getVotesForAction(sid, action.id),
  ]);

  broadcast(sid, {
    type: "review:vote_updated",
    payload: { actionId: action.id, tally: tallyVotes(votes) },
  });

  return c.json(serializeVote(vote!), 201);
});

// Accept the current review vote outcome for one previous action.
reviewRoutes.post("/sessions/:sid/reviews", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await getSessionForReview(user.id, sid);
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.createdBy !== user.id) {
    return jsonError(c, 403, "forbidden", "Only the session facilitator can accept review outcomes.");
  }

  const parsed = await parseJsonBody(c, finalizeReviewBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const action = await getReviewableAction(session, parsed.data.actionId);
  if (!action) return jsonError(c, 404, "not_found", "Action not found.");

  const existingFinalReview = await getExistingFinalReview(sid, action.id);
  if (existingFinalReview) {
    return c.json(serializeReview(existingFinalReview));
  }

  if (session.phase !== "review") {
    return jsonError(c, 400, "invalid_phase", "Reviews can only be finalized during the review phase.");
  }

  const votes = await getVotesForAction(sid, action.id);
  const tally = tallyVotes(votes);
  if (tally.total === 0) {
    return jsonError(c, 400, "invalid_request", "At least one vote is required before accepting a review outcome.");
  }

  const topStatuses = getTopStatuses(tally);
  let finalStatus: ReviewStatus;
  if (topStatuses.length === 1) {
    finalStatus = topStatuses[0]!;
    if (parsed.data.status && parsed.data.status !== finalStatus) {
      return jsonError(c, 400, "invalid_request", "The accepted outcome must match the current top vote.");
    }
  } else {
    if (!parsed.data.status || !topStatuses.includes(parsed.data.status)) {
      return jsonError(c, 400, "tie_break_required", "Choose one of the tied review outcomes before continuing.");
    }
    finalStatus = parsed.data.status;
  }

  const finalComment = buildFinalComment(finalStatus, votes);
  const now = new Date();

  const { review, created } = db.transaction((tx) => {
    const existing = tx
      .select()
      .from(schema.actionReviews)
      .where(and(eq(schema.actionReviews.sessionId, sid), eq(schema.actionReviews.actionId, action.id)))
      .get();

    if (existing) {
      return { review: existing, created: false };
    }

    const review = {
      id: newId(),
      actionId: action.id,
      sessionId: sid,
      reviewerId: user.id,
      status: finalStatus,
      comment: finalComment,
      actionedVoteCount: tally.actioned,
      didNothingVoteCount: tally.didNothing,
      disagreeVoteCount: tally.disagree,
      createdAt: now,
    };

    tx.insert(schema.actionReviews).values(review).run();

    if (finalStatus === "did_nothing") {
      tx.insert(schema.actions).values({
        id: newId(),
        sessionId: sid,
        bundleId: null,
        description: action.description,
        assigneeId: null,
        createdAt: now,
      }).run();
    }

    return { review, created: true };
  });

  broadcast(sid, { type: "review:finalized", payload: { actionId: action.id } });

  const phaseChanged = created ? await maybeAdvanceToIdeation(session) : false;
  if (phaseChanged) {
    broadcast(sid, { type: "phase:changed", payload: { phase: "ideation" } });
  }

  return c.json(serializeReview(review), created ? 201 : 200);
});

// Get all final reviews for this session
reviewRoutes.get("/sessions/:sid/reviews", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const reviews = await db
    .select()
    .from(schema.actionReviews)
    .where(eq(schema.actionReviews.sessionId, sid));

  return c.json(reviews.map(serializeReview));
});
