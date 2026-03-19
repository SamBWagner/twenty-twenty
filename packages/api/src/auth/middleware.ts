import { createMiddleware } from "hono/factory";
import { and, eq, isNull } from "drizzle-orm";
import { authModeSchema, type AuthMode } from "@twenty-twenty/shared";
import { auth } from "./index.js";
import { db, schema } from "../db/index.js";
import { extractBearerToken, findPersonalAccessToken, markPersonalAccessTokenUsed } from "./personal-access-tokens.js";
import { jsonError } from "../lib/http.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

type AuthEnv = {
  Variables: {
    user: AuthUser;
    authMode: AuthMode;
    personalAccessTokenId: string | null;
  };
};

export interface RequestAuthResult {
  user: AuthUser | null;
  authMode: AuthMode | null;
  personalAccessTokenId: string | null;
}

function normalizeUser(user: {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}): AuthUser {
  return {
    id: user.id,
    name: user.name || "Anonymous",
    email: user.email || "",
    image: user.image || null,
  };
}

export async function authenticateRequest(headers: Headers): Promise<RequestAuthResult> {
  const bearerToken = extractBearerToken(headers);
  if (bearerToken) {
    const personalAccessToken = await findPersonalAccessToken(bearerToken);
    if (personalAccessToken) {
      const user = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, personalAccessToken.userId))
        .get();

      if (user) {
        void markPersonalAccessTokenUsed(personalAccessToken.id);

        return {
          user: normalizeUser(user),
          authMode: authModeSchema.enum.personal_access_token,
          personalAccessTokenId: personalAccessToken.id,
        };
      }
    }
  }

  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return {
      user: null,
      authMode: null,
      personalAccessTokenId: null,
    };
  }

  return {
    user: normalizeUser(session.user),
    authMode: authModeSchema.enum.session,
    personalAccessTokenId: null,
  };
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const result = await authenticateRequest(c.req.raw.headers);
  if (!result.user || !result.authMode) {
    return jsonError(c, 401, "unauthorized", "Authentication is required.");
  }

  c.set("user", result.user);
  c.set("authMode", result.authMode);
  c.set("personalAccessTokenId", result.personalAccessTokenId);
  await next();
});
