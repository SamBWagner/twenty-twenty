import * as z from "zod/v4";
import {
  ITEM_TYPES,
  MEMBER_ROLES,
  PARTICIPANT_ROLES,
  REVIEW_STATUSES,
  SESSION_PHASES,
  VOTE_VALUES,
} from "./constants.js";

export const isoDateTimeSchema = z.string();

export const sessionPhaseSchema = z.enum(SESSION_PHASES);
export const itemTypeSchema = z.enum(ITEM_TYPES);
export const voteValueSchema = z.union([z.literal(VOTE_VALUES[0]), z.literal(VOTE_VALUES[1])]);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export const participantRoleSchema = z.enum(PARTICIPANT_ROLES);
export const authModeSchema = z.enum(["session", "personal_access_token"]);

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable(),
});

export const authStatusSchema = z.object({
  githubConfigured: z.boolean(),
  authSecretConfigured: z.boolean(),
  readyForOAuth: z.boolean(),
  missingEnvVars: z.array(z.string()),
  callbackUrl: z.string(),
  apiUrl: z.string(),
  webUrl: z.string(),
  trustedOrigins: z.array(z.string()),
});

export const authSessionSchema = z.object({
  viewer: userSchema.nullable(),
  authMode: authModeSchema.nullable(),
  auth: authStatusSchema,
});

export const viewerCapabilitiesSchema = z.object({
  canManageProject: z.boolean(),
  canCreateSession: z.boolean(),
  canManageInvitations: z.boolean(),
  canManageMembers: z.boolean(),
  canDeleteProject: z.boolean(),
  canLeaveProject: z.boolean(),
  canAdvancePhase: z.boolean(),
  canShareSession: z.boolean(),
  canEditIdeation: z.boolean(),
  canEditActionBoard: z.boolean(),
  canSubmitReviews: z.boolean(),
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdBy: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const projectListItemSchema = projectSchema.extend({
  role: memberRoleSchema,
});

export const projectMemberSchema = z.object({
  userId: z.string(),
  role: memberRoleSchema,
  joinedAt: isoDateTimeSchema,
  username: z.string(),
  avatarUrl: z.string().nullable(),
});

export const projectInvitationSchema = z.object({
  id: z.string(),
  token: z.string(),
  invitedByUserName: z.string(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export const invitationPreviewSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  projectDescription: z.string().nullable(),
  invitedByUserName: z.string(),
  expiresAt: isoDateTimeSchema,
  isMember: z.boolean(),
});

export const retroSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  phase: sessionPhaseSchema,
  sequence: z.number().int().positive(),
  createdBy: z.string(),
  createdAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
});

export const sharePreviewSchema = z.object({
  sessionId: z.string(),
  sessionName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  phase: sessionPhaseSchema,
  isMember: z.boolean(),
});

export const summaryShareTokenResponseSchema = z.object({
  summaryShareToken: z.string(),
});

export const sessionParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  role: participantRoleSchema,
  joinedAt: isoDateTimeSchema,
});

export const retroItemSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  authorId: z.string().nullable(),
  type: itemTypeSchema,
  content: z.string(),
  createdAt: isoDateTimeSchema,
  voteCount: z.number().int(),
  userVote: z.number().int(),
  isOwn: z.boolean(),
});

export const actionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  description: z.string(),
  createdAt: isoDateTimeSchema,
});

export const actionReviewSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  sessionId: z.string(),
  reviewerId: z.string(),
  status: reviewStatusSchema,
  comment: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export const reviewStateSchema = z.object({
  actions: z.array(actionSchema),
  reviews: z.array(actionReviewSchema),
  pending: z.array(actionSchema),
  total: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
});

export const projectViewSchema = z.object({
  project: projectSchema,
  sessions: z.array(retroSessionSchema),
  members: z.array(projectMemberSchema),
  invitations: z.array(projectInvitationSchema),
  viewerMembership: projectMemberSchema.nullable(),
  viewerCapabilities: viewerCapabilitiesSchema,
});

export const sessionViewSchema = z.object({
  session: retroSessionSchema,
  participants: z.array(sessionParticipantSchema),
  projectMembers: z.array(projectMemberSchema),
  items: z.array(retroItemSchema),
  actions: z.array(actionSchema),
  reviewState: reviewStateSchema,
  viewerCapabilities: viewerCapabilitiesSchema,
});

export const sessionSummaryReviewSchema = z.object({
  actionId: z.string(),
  actionDescription: z.string(),
  reviewerId: z.string(),
  reviewerName: z.string(),
  status: reviewStatusSchema,
  comment: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export const sessionSummarySchema = z.object({
  session: retroSessionSchema,
  participants: z.array(sessionParticipantSchema),
  items: z.array(
    z.object({
      id: z.string(),
      sessionId: z.string(),
      authorId: z.string(),
      type: itemTypeSchema,
      content: z.string(),
      createdAt: isoDateTimeSchema,
      voteCount: z.number().int(),
    }),
  ),
  actions: z.array(actionSchema),
  reviews: z.array(sessionSummaryReviewSchema),
});

export const sharedSessionSummarySchema = z.object({
  session: z.object({
    name: z.string(),
    sequence: z.number().int().positive(),
    closedAt: isoDateTimeSchema.nullable(),
  }),
  participants: z.array(z.object({
    username: z.string(),
    avatarUrl: z.string().nullable(),
    role: participantRoleSchema,
  })),
  reviews: z.array(z.object({
    actionDescription: z.string(),
    reviewerName: z.string(),
    status: reviewStatusSchema,
    comment: z.string().nullable(),
    createdAt: isoDateTimeSchema,
  })),
  goodItems: z.array(z.object({
    content: z.string(),
    voteCount: z.number().int(),
  })),
  badItems: z.array(z.object({
    content: z.string(),
    voteCount: z.number().int(),
  })),
  actions: z.array(z.object({
    description: z.string(),
  })),
  actionCount: z.number().int().nonnegative(),
});

export const personalAccessTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});

export const createdPersonalAccessTokenSchema = personalAccessTokenSchema.extend({
  token: z.string(),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable().or(z.literal("")),
});

export const createSessionBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export const createItemBodySchema = z.object({
  type: itemTypeSchema,
  content: z.string().trim().min(1).max(2000),
});

export const voteItemBodySchema = z.object({
  value: voteValueSchema,
});

export const createActionBodySchema = z.object({
  description: z.string().trim().min(1).max(2000),
});

export const updateActionBodySchema = z.object({
  description: z.string().trim().min(1).max(2000).optional(),
});

export const submitReviewBodySchema = z.object({
  actionId: z.string(),
  status: reviewStatusSchema,
  comment: z.string().trim().max(2000).optional(),
});

export const createPersonalAccessTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type User = z.infer<typeof userSchema>;
export type AuthStatus = z.infer<typeof authStatusSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthMode = z.infer<typeof authModeSchema>;
export type ViewerCapabilities = z.infer<typeof viewerCapabilitiesSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type ProjectInvitation = z.infer<typeof projectInvitationSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type RetroSession = z.infer<typeof retroSessionSchema>;
export type SharePreview = z.infer<typeof sharePreviewSchema>;
export type SummaryShareTokenResponse = z.infer<typeof summaryShareTokenResponseSchema>;
export type SessionParticipant = z.infer<typeof sessionParticipantSchema>;
export type RetroItem = z.infer<typeof retroItemSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ActionReview = z.infer<typeof actionReviewSchema>;
export type ReviewState = z.infer<typeof reviewStateSchema>;
export type ProjectView = z.infer<typeof projectViewSchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SharedSessionSummary = z.infer<typeof sharedSessionSummarySchema>;
export type PersonalAccessToken = z.infer<typeof personalAccessTokenSchema>;
export type CreatedPersonalAccessToken = z.infer<typeof createdPersonalAccessTokenSchema>;
