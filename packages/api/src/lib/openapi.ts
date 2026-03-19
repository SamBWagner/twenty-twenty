import * as z from "zod/v4";
import { toJSONSchema } from "zod/v4";
import {
  actionReviewSchema,
  actionSchema,
  apiErrorResponseSchema,
  authSessionSchema,
  bundleSchema,
  createActionBodySchema,
  createItemBodySchema,
  createPersonalAccessTokenBodySchema,
  createProjectBodySchema,
  createSessionBodySchema,
  createdPersonalAccessTokenSchema,
  invitationPreviewSchema,
  personalAccessTokenSchema,
  projectInvitationSchema,
  projectListItemSchema,
  projectMemberSchema,
  projectSchema,
  projectViewSchema,
  retroItemSchema,
  retroSessionSchema,
  reviewStateSchema,
  sessionParticipantSchema,
  sessionSummarySchema,
  sessionViewSchema,
  sharePreviewSchema,
  submitReviewBodySchema,
  updateActionBodySchema,
  updateBundleBodySchema,
  updateProjectBodySchema,
  voteItemBodySchema,
} from "@twenty-twenty/shared";

const okResponseSchema = z.object({ ok: z.boolean() });
const phaseResponseSchema = z.object({ phase: z.string() });
const shareTokenResponseSchema = z.object({ shareToken: z.string() });
const joinResultSchema = z.object({ sessionId: z.string(), projectId: z.string() });
const projectDetailSchema = projectSchema.extend({
  members: z.array(projectMemberSchema as any),
});
const projectInviteJoinResultSchema = z.object({ ok: z.boolean(), projectId: z.string() });

const componentSchemas = {
  ApiErrorResponse: apiErrorResponseSchema,
  AuthSession: authSessionSchema,
  PersonalAccessToken: personalAccessTokenSchema,
  CreatedPersonalAccessToken: createdPersonalAccessTokenSchema,
  Project: projectSchema,
  ProjectDetail: projectDetailSchema,
  ProjectListItem: projectListItemSchema,
  ProjectMember: projectMemberSchema,
  ProjectInvitation: projectInvitationSchema,
  InvitationPreview: invitationPreviewSchema,
  ProjectView: projectViewSchema,
  Session: retroSessionSchema,
  SessionParticipant: sessionParticipantSchema,
  SessionView: sessionViewSchema,
  SessionSummary: sessionSummarySchema,
  SharePreview: sharePreviewSchema,
  Item: retroItemSchema,
  Bundle: bundleSchema,
  Action: actionSchema,
  ActionReview: actionReviewSchema,
  ReviewState: reviewStateSchema,
  CreateProjectBody: createProjectBodySchema,
  UpdateProjectBody: updateProjectBodySchema,
  CreateSessionBody: createSessionBodySchema,
  CreateItemBody: createItemBodySchema,
  VoteItemBody: voteItemBodySchema,
  UpdateBundleBody: updateBundleBodySchema,
  CreateActionBody: createActionBodySchema,
  UpdateActionBody: updateActionBodySchema,
  SubmitReviewBody: submitReviewBodySchema,
  CreatePersonalAccessTokenBody: createPersonalAccessTokenBodySchema,
  OkResponse: okResponseSchema,
  PhaseResponse: phaseResponseSchema,
  ShareTokenResponse: shareTokenResponseSchema,
  JoinResult: joinResultSchema,
  ProjectInviteJoinResult: projectInviteJoinResultSchema,
};

function ref(name: keyof typeof componentSchemas) {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonResponse(name: keyof typeof componentSchemas, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: ref(name),
      },
    },
  };
}

function arrayResponse(name: keyof typeof componentSchemas, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "array",
          items: ref(name),
        },
      },
    },
  };
}

function body(name: keyof typeof componentSchemas) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: ref(name),
      },
    },
  };
}

const protectedRouteSecurity = [{ bearerAuth: [] }, { cookieAuth: [] }];

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Twenty Twenty API",
      version: "1.0.0",
      description: "Public API for the Twenty Twenty retrospective application.",
    },
    servers: [
      { url: "/api/v1" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      schemas: Object.fromEntries(
        Object.entries(componentSchemas).map(([name, schema]) => [
          name,
          toJSONSchema(schema as any, { target: "draft-7" }),
        ]),
      ),
    },
    paths: {
      "/auth/session": {
        get: {
          summary: "Get the current viewer session and auth readiness state",
          tags: ["Auth"],
          responses: {
            200: jsonResponse("AuthSession", "The current auth session."),
          },
        },
      },
      "/auth/tokens": {
        get: {
          summary: "List personal access tokens for the current user",
          tags: ["Auth"],
          security: protectedRouteSecurity,
          responses: {
            200: arrayResponse("PersonalAccessToken", "Personal access tokens."),
            401: jsonResponse("ApiErrorResponse", "Unauthorized."),
          },
        },
        post: {
          summary: "Create a new personal access token",
          tags: ["Auth"],
          security: protectedRouteSecurity,
          requestBody: body("CreatePersonalAccessTokenBody"),
          responses: {
            201: jsonResponse("CreatedPersonalAccessToken", "The created personal access token."),
            400: jsonResponse("ApiErrorResponse", "Invalid request."),
            401: jsonResponse("ApiErrorResponse", "Unauthorized."),
          },
        },
      },
      "/auth/tokens/{tokenId}": {
        delete: {
          summary: "Revoke a personal access token",
          tags: ["Auth"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "tokenId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("OkResponse", "Token revoked."),
            401: jsonResponse("ApiErrorResponse", "Unauthorized."),
            404: jsonResponse("ApiErrorResponse", "Not found."),
          },
        },
      },
      "/projects": {
        get: {
          summary: "List the current user's projects",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          responses: {
            200: arrayResponse("ProjectListItem", "Projects."),
          },
        },
        post: {
          summary: "Create a project",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          requestBody: body("CreateProjectBody"),
          responses: {
            201: jsonResponse("Project", "Project created."),
            400: jsonResponse("ApiErrorResponse", "Invalid request."),
          },
        },
      },
      "/projects/{pid}": {
        get: {
          summary: "Get project detail",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("ProjectDetail", "Project detail."),
            404: jsonResponse("ApiErrorResponse", "Not found."),
          },
        },
        patch: {
          summary: "Update a project",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: body("UpdateProjectBody"),
          responses: {
            200: jsonResponse("Project", "Updated project."),
            400: jsonResponse("ApiErrorResponse", "Invalid request."),
            403: jsonResponse("ApiErrorResponse", "Forbidden."),
          },
        },
        delete: {
          summary: "Delete a project",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("OkResponse", "Project deleted."),
            400: jsonResponse("ApiErrorResponse", "Project cannot be deleted."),
            403: jsonResponse("ApiErrorResponse", "Forbidden."),
          },
        },
      },
      "/projects/{pid}/view": {
        get: {
          summary: "Get the project screen view model",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("ProjectView", "Project view."),
            404: jsonResponse("ApiErrorResponse", "Not found."),
          },
        },
      },
      "/projects/{pid}/members": {
        get: {
          summary: "List project members",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("ProjectMember", "Project members."),
          },
        },
        post: {
          summary: "Add a project member",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId"],
                  properties: {
                    userId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: jsonResponse("OkResponse", "Member added."),
            403: jsonResponse("ApiErrorResponse", "Forbidden."),
          },
        },
      },
      "/projects/{pid}/members/{uid}": {
        delete: {
          summary: "Remove a project member",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "pid", in: "path", required: true, schema: { type: "string" } },
            { name: "uid", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("OkResponse", "Member removed."),
            403: jsonResponse("ApiErrorResponse", "Forbidden."),
            404: jsonResponse("ApiErrorResponse", "Not found."),
          },
        },
      },
      "/projects/{pid}/membership": {
        delete: {
          summary: "Leave a project",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("OkResponse", "Left project."),
            400: jsonResponse("ApiErrorResponse", "Invalid request."),
          },
        },
      },
      "/projects/invite/{token}": {
        get: {
          summary: "Preview a project invitation",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("InvitationPreview", "Invitation preview."),
            404: jsonResponse("ApiErrorResponse", "Not found."),
          },
        },
        post: {
          summary: "Join a project using an invitation",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("ProjectInviteJoinResult", "Project joined."),
            404: jsonResponse("ApiErrorResponse", "Not found."),
          },
        },
      },
      "/projects/{pid}/invitations": {
        get: {
          summary: "List active invitation links for a project",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("ProjectInvitation", "Project invitations."),
          },
        },
        post: {
          summary: "Create an invitation link for a project",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            201: jsonResponse("ProjectInvitation", "Invitation created."),
          },
        },
      },
      "/projects/{pid}/invitations/{iid}": {
        delete: {
          summary: "Revoke an invitation link",
          tags: ["Projects"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "pid", in: "path", required: true, schema: { type: "string" } },
            { name: "iid", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("OkResponse", "Invitation revoked."),
          },
        },
      },
      "/projects/{pid}/sessions": {
        get: {
          summary: "List sessions for a project",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("Session", "Sessions."),
          },
        },
        post: {
          summary: "Create a session",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "pid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: body("CreateSessionBody"),
          responses: {
            201: jsonResponse("Session", "Session created."),
          },
        },
      },
      "/sessions/{sid}": {
        get: {
          summary: "Get a session",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("Session", "Session detail."),
          },
        },
      },
      "/sessions/{sid}/view": {
        get: {
          summary: "Get the session workspace view model",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("SessionView", "Session view."),
          },
        },
      },
      "/sessions/{sid}/summary": {
        get: {
          summary: "Get the final session summary",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("SessionSummary", "Session summary."),
          },
        },
      },
      "/sessions/{sid}/phase": {
        patch: {
          summary: "Advance the session phase",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("PhaseResponse", "Updated session phase."),
          },
        },
      },
      "/sessions/{sid}/share": {
        post: {
          summary: "Create or return a session share token",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("ShareTokenResponse", "Session share token."),
          },
        },
      },
      "/sessions/{sid}/participants": {
        get: {
          summary: "List session participants",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("SessionParticipant", "Session participants."),
          },
        },
      },
      "/sessions/join/{token}": {
        get: {
          summary: "Preview a share token",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("SharePreview", "Share preview."),
          },
        },
        post: {
          summary: "Join a session as a guest",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("JoinResult", "Joined session."),
          },
        },
      },
      "/sessions/join/{token}/project": {
        post: {
          summary: "Join the underlying project from a share token",
          tags: ["Sessions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("JoinResult", "Joined project."),
          },
        },
      },
      "/sessions/{sid}/items": {
        get: {
          summary: "List retro items",
          tags: ["Items"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("Item", "Retro items."),
          },
        },
        post: {
          summary: "Create a retro item",
          tags: ["Items"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: body("CreateItemBody"),
          responses: {
            201: jsonResponse("Item", "Item created."),
          },
        },
      },
      "/sessions/{sid}/items/{iid}/vote": {
        post: {
          summary: "Vote on a retro item",
          tags: ["Items"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "sid", in: "path", required: true, schema: { type: "string" } },
            { name: "iid", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: body("VoteItemBody"),
          responses: {
            200: {
              description: "Updated vote state.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["itemId", "voteCount", "userVote"],
                    properties: {
                      itemId: { type: "string" },
                      voteCount: { type: "integer" },
                      userVote: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/sessions/{sid}/items/{iid}": {
        delete: {
          summary: "Delete a retro item",
          tags: ["Items"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "sid", in: "path", required: true, schema: { type: "string" } },
            { name: "iid", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("OkResponse", "Item deleted."),
          },
        },
      },
      "/sessions/{sid}/bundles": {
        get: {
          summary: "List action bundles",
          tags: ["Bundles"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("Bundle", "Bundles."),
          },
        },
        post: {
          summary: "Create an action bundle",
          tags: ["Bundles"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: body("UpdateBundleBody"),
          responses: {
            201: jsonResponse("Bundle", "Bundle created."),
          },
        },
      },
      "/sessions/{sid}/bundles/{bid}": {
        patch: {
          summary: "Update an action bundle",
          tags: ["Bundles"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "sid", in: "path", required: true, schema: { type: "string" } },
            { name: "bid", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: body("UpdateBundleBody"),
          responses: {
            200: jsonResponse("Bundle", "Bundle updated."),
          },
        },
        delete: {
          summary: "Delete an action bundle",
          tags: ["Bundles"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "sid", in: "path", required: true, schema: { type: "string" } },
            { name: "bid", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("OkResponse", "Bundle deleted."),
          },
        },
      },
      "/sessions/{sid}/actions": {
        get: {
          summary: "List actions for a session",
          tags: ["Actions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("Action", "Actions."),
          },
        },
        post: {
          summary: "Create an action",
          tags: ["Actions"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: body("CreateActionBody"),
          responses: {
            201: jsonResponse("Action", "Action created."),
          },
        },
      },
      "/sessions/{sid}/actions/{aid}": {
        patch: {
          summary: "Update an action",
          tags: ["Actions"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "sid", in: "path", required: true, schema: { type: "string" } },
            { name: "aid", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: body("UpdateActionBody"),
          responses: {
            200: jsonResponse("Action", "Action updated."),
          },
        },
        delete: {
          summary: "Delete an action",
          tags: ["Actions"],
          security: protectedRouteSecurity,
          parameters: [
            { name: "sid", in: "path", required: true, schema: { type: "string" } },
            { name: "aid", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: jsonResponse("OkResponse", "Action deleted."),
          },
        },
      },
      "/sessions/{sid}/reviews/pending": {
        get: {
          summary: "Get review state for the previous session's actions",
          tags: ["Reviews"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: jsonResponse("ReviewState", "Review state."),
          },
        },
      },
      "/sessions/{sid}/reviews": {
        get: {
          summary: "List reviews for a session",
          tags: ["Reviews"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: arrayResponse("ActionReview", "Reviews."),
          },
        },
        post: {
          summary: "Submit a review",
          tags: ["Reviews"],
          security: protectedRouteSecurity,
          parameters: [{ name: "sid", in: "path", required: true, schema: { type: "string" } }],
          requestBody: body("SubmitReviewBody"),
          responses: {
            201: jsonResponse("ActionReview", "Review created."),
          },
        },
      },
    },
  };
}
