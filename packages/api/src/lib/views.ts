import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import {
  actionReviewSchema,
  actionSchema,
  projectInvitationSchema,
  projectMemberSchema,
  projectSchema,
  projectViewSchema,
  retroItemSchema,
  retroSessionSchema,
  reviewStateSchema,
  sharedSessionSummarySchema,
  sessionParticipantSchema,
  sessionSummarySchema,
  sessionViewSchema,
  type SessionSummary,
  type SharedSessionSummary,
  type ViewerCapabilities,
} from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { canAccessSession } from "./session-access.js";
import { toIsoString, toNullableIsoString } from "./http.js";

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

function serializeProjectMember(member: {
  userId: string;
  role: "owner" | "member";
  joinedAt: Date;
  username: string;
  avatarUrl: string | null;
}) {
  return projectMemberSchema.parse({
    userId: member.userId,
    role: member.role,
    joinedAt: toIsoString(member.joinedAt),
    username: member.username,
    avatarUrl: member.avatarUrl,
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

function buildViewerCapabilities(input: {
  projectRole: "owner" | "member" | null;
  projectMemberCount: number;
  session:
    | {
      createdBy: string;
      phase: "review" | "ideation" | "action" | "closed";
    }
    | null;
  userId: string;
  canAccessCurrentSession: boolean;
}): ViewerCapabilities {
  const isOwner = input.projectRole === "owner";
  const isMember = input.projectRole !== null;
  const session = input.session;

  return {
    canManageProject: isOwner,
    canCreateSession: isMember,
    canManageInvitations: isOwner,
    canManageMembers: isOwner,
    canDeleteProject: isOwner && input.projectMemberCount === 1,
    canLeaveProject: isMember && !isOwner,
    canAdvancePhase: Boolean(
      session
      && session.createdBy === input.userId
      && (session.phase === "ideation" || session.phase === "action"),
    ),
    canShareSession: isMember && input.canAccessCurrentSession,
    canEditIdeation: input.canAccessCurrentSession && session?.phase === "ideation",
    canEditActionBoard: input.canAccessCurrentSession && session?.phase === "action",
    canSubmitReviews: input.canAccessCurrentSession && session?.phase === "review",
  };
}

export async function getProjectMembers(projectId: string) {
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
    .where(eq(schema.projectMembers.projectId, projectId));

  return members.map(serializeProjectMember);
}

export async function getProjectView(projectId: string, userId: string) {
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    return null;
  }

  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, userId)))
    .get();

  if (!membership) {
    return null;
  }

  const [sessions, members, invitations] = await Promise.all([
    db
      .select()
      .from(schema.retroSessions)
      .where(eq(schema.retroSessions.projectId, projectId))
      .orderBy(desc(schema.retroSessions.sequence)),
    getProjectMembers(projectId),
    membership.role === "owner"
      ? db
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
          eq(schema.projectInvitations.projectId, projectId),
          gt(schema.projectInvitations.expiresAt, new Date()),
        ))
        .orderBy(desc(schema.projectInvitations.createdAt))
      : Promise.resolve([]),
  ]);

  const viewerMembership = members.find((member) => member.userId === userId) || null;

  return projectViewSchema.parse({
    project: serializeProject(project),
    sessions: sessions.map(serializeSession),
    members,
    invitations: invitations.map(serializeInvitation),
    viewerMembership,
    viewerCapabilities: buildViewerCapabilities({
      projectRole: membership.role,
      projectMemberCount: members.length,
      session: null,
      userId,
      canAccessCurrentSession: false,
    }),
  });
}

function buildVoteCountByItemId(voteRows: Array<{ itemId: string; value: number }>) {
  const voteCountByItemId = new Map<string, number>();
  for (const vote of voteRows) {
    voteCountByItemId.set(vote.itemId, (voteCountByItemId.get(vote.itemId) || 0) + vote.value);
  }
  return voteCountByItemId;
}

async function buildSessionSummary(session: typeof schema.retroSessions.$inferSelect): Promise<SessionSummary> {
  const sid = session.id;
  const participantFilter = session.closedAt
    ? and(
      eq(schema.sessionParticipants.sessionId, sid),
      lte(schema.sessionParticipants.joinedAt, session.closedAt),
    )
    : eq(schema.sessionParticipants.sessionId, sid);

  const [participants, items, actions] = await Promise.all([
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
      .where(participantFilter)
      .orderBy(asc(schema.sessionParticipants.joinedAt)),
    db
      .select()
      .from(schema.items)
      .where(eq(schema.items.sessionId, sid))
      .orderBy(asc(schema.items.createdAt)),
    db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, sid))
      .orderBy(asc(schema.actions.createdAt)),
  ]);

  const voteRows = await db
    .select({
      itemId: schema.votes.itemId,
      value: schema.votes.value,
    })
    .from(schema.votes)
    .innerJoin(schema.items, eq(schema.votes.itemId, schema.items.id))
    .where(eq(schema.items.sessionId, sid));

  const voteCountByItemId = buildVoteCountByItemId(voteRows);

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

  return sessionSummarySchema.parse({
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
    actions: actions.map((action) => actionSchema.parse({
      id: action.id,
      sessionId: action.sessionId,
      description: action.description,

      createdAt: toIsoString(action.createdAt),
    })),
    reviews,
  });
}

function toSharedSessionSummary(summary: SessionSummary): SharedSessionSummary {
  const goodItems = summary.items
    .filter((item) => item.type === "good")
    .sort((a, b) => b.voteCount - a.voteCount)
    .map((item) => ({
      content: item.content,
      voteCount: item.voteCount,
    }));
  const badItems = summary.items
    .filter((item) => item.type === "bad")
    .sort((a, b) => b.voteCount - a.voteCount)
    .map((item) => ({
      content: item.content,
      voteCount: item.voteCount,
    }));
  return sharedSessionSummarySchema.parse({
    session: {
      name: summary.session.name,
      sequence: summary.session.sequence,
      closedAt: summary.session.closedAt,
    },
    participants: summary.participants.map((participant) => ({
      username: participant.username,
      avatarUrl: participant.avatarUrl,
      role: participant.role,
    })),
    reviews: summary.reviews.map((review) => ({
      actionDescription: review.actionDescription,
      reviewerName: review.reviewerName,
      status: review.status,
      comment: review.comment,
      createdAt: review.createdAt,
    })),
    goodItems,
    badItems,
    actions: summary.actions.map((action) => ({ description: action.description })),
    actionCount: summary.actions.length,
  });
}

export async function getSessionSummary(sessionId: string) {
  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sessionId)).get();
  if (!session) {
    return null;
  }

  return buildSessionSummary(session);
}

export async function getSharedSessionSummaryByToken(token: string) {
  const session = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.summaryShareToken, token))
    .get();

  if (!session || session.phase !== "closed") {
    return null;
  }

  const summary = await buildSessionSummary(session);
  return toSharedSessionSummary(summary);
}

export async function getReviewStateForSession(session: typeof schema.retroSessions.$inferSelect) {
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

  if (!previousSession) {
    return reviewStateSchema.parse({
      actions: [],
      reviews: [],
      pending: [],
      total: 0,
      reviewed: 0,
    });
  }

  const [previousActions, reviews] = await Promise.all([
    db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, previousSession.id))
      .orderBy(asc(schema.actions.createdAt)),
    db
      .select()
      .from(schema.actionReviews)
      .where(eq(schema.actionReviews.sessionId, session.id))
      .orderBy(asc(schema.actionReviews.createdAt)),
  ]);

  const reviewedActionIds = new Set(reviews.map((review) => review.actionId));

  return reviewStateSchema.parse({
    actions: previousActions.map((action) => actionSchema.parse({
      id: action.id,
      sessionId: action.sessionId,
      description: action.description,

      createdAt: toIsoString(action.createdAt),
    })),
    reviews: reviews.map((review) => actionReviewSchema.parse({
      id: review.id,
      actionId: review.actionId,
      sessionId: review.sessionId,
      reviewerId: review.reviewerId,
      status: review.status,
      comment: review.comment,
      createdAt: toIsoString(review.createdAt),
    })),
    pending: previousActions
      .filter((action) => !reviewedActionIds.has(action.id))
      .map((action) => actionSchema.parse({
        id: action.id,
        sessionId: action.sessionId,
        description: action.description,
  
        createdAt: toIsoString(action.createdAt),
      })),
    total: previousActions.length,
    reviewed: reviews.length,
  });
}

export async function getSessionView(sessionId: string, userId: string) {
  const access = await canAccessSession(userId, sessionId);
  if (!access.allowed) {
    return null;
  }

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sessionId)).get();
  if (!session) {
    return null;
  }

  const participantFilter = session.closedAt
    ? and(
      eq(schema.sessionParticipants.sessionId, sessionId),
      lte(schema.sessionParticipants.joinedAt, session.closedAt),
    )
    : eq(schema.sessionParticipants.sessionId, sessionId);

  const [projectMembership, projectMembers, participants, items, actions, voteRows, reviewState] = await Promise.all([
    db
      .select()
      .from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, session.projectId), eq(schema.projectMembers.userId, userId)))
      .get(),
    getProjectMembers(session.projectId),
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
      .where(participantFilter)
      .orderBy(asc(schema.sessionParticipants.joinedAt)),
    db
      .select()
      .from(schema.items)
      .where(eq(schema.items.sessionId, sessionId))
      .orderBy(asc(schema.items.createdAt)),
    db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.sessionId, sessionId))
      .orderBy(asc(schema.actions.createdAt)),
    db
      .select()
      .from(schema.votes)
      .innerJoin(schema.items, eq(schema.items.id, schema.votes.itemId))
      .where(eq(schema.items.sessionId, sessionId)),
    getReviewStateForSession(session),
  ]);

  const voteCountByItemId = new Map<string, number>();
  const userVoteByItemId = new Map<string, number>();

  for (const vote of voteRows) {
    voteCountByItemId.set(vote.votes.itemId, (voteCountByItemId.get(vote.votes.itemId) || 0) + vote.votes.value);
    if (vote.votes.userId === userId) {
      userVoteByItemId.set(vote.votes.itemId, vote.votes.value);
    }
  }

  return sessionViewSchema.parse({
    session: serializeSession(session),
    participants: participants.map(serializeParticipant),
    projectMembers,
    items: items.map((item) => retroItemSchema.parse({
      id: item.id,
      sessionId: item.sessionId,
      authorId: session.phase === "ideation" ? null : item.authorId,
      type: item.type,
      content: item.content,
      createdAt: toIsoString(item.createdAt),
      voteCount: voteCountByItemId.get(item.id) || 0,
      userVote: userVoteByItemId.get(item.id) || 0,
      isOwn: item.authorId === userId,
    })),
    actions: actions.map((action) => actionSchema.parse({
      id: action.id,
      sessionId: action.sessionId,
      description: action.description,

      createdAt: toIsoString(action.createdAt),
    })),
    reviewState,
    viewerCapabilities: buildViewerCapabilities({
      projectRole: projectMembership?.role || null,
      projectMemberCount: projectMembers.length,
      session: {
        createdBy: session.createdBy,
        phase: session.phase,
      },
      userId,
      canAccessCurrentSession: access.allowed,
    }),
  });
}
