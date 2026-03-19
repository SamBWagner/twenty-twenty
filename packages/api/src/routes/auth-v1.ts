import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  authSessionSchema,
  createPersonalAccessTokenBodySchema,
  createdPersonalAccessTokenSchema,
  personalAccessTokenSchema,
} from "@twenty-twenty/shared";
import {
  authBaseUrl,
  authSecretConfigured,
  githubAuthConfigured,
  githubCallbackUrl,
  trustedOrigins,
  webUrl,
} from "../auth/index.js";
import { authenticateRequest, requireAuth } from "../auth/middleware.js";
import {
  createPersonalAccessTokenValue,
  getPersonalAccessTokenPrefix,
  hashPersonalAccessToken,
} from "../auth/personal-access-tokens.js";
import { db, schema } from "../db/index.js";
import { newId } from "../lib/id.js";
import { jsonError, parseJsonBody, toIsoString, toNullableIsoString } from "../lib/http.js";

export const authV1Routes = new Hono();

function buildAuthStatus() {
  const missingEnvVars: string[] = [];

  if (!process.env.BETTER_AUTH_SECRET?.trim()) {
    missingEnvVars.push("BETTER_AUTH_SECRET");
  }
  if (!process.env.GITHUB_CLIENT_ID?.trim()) {
    missingEnvVars.push("GITHUB_CLIENT_ID");
  }
  if (!process.env.GITHUB_CLIENT_SECRET?.trim()) {
    missingEnvVars.push("GITHUB_CLIENT_SECRET");
  }

  return {
    githubConfigured: githubAuthConfigured,
    authSecretConfigured,
    readyForOAuth: githubAuthConfigured && authSecretConfigured,
    missingEnvVars,
    callbackUrl: githubCallbackUrl,
    apiUrl: authBaseUrl,
    webUrl,
    trustedOrigins,
  };
}

function serializePersonalAccessToken(token: typeof schema.personalAccessTokens.$inferSelect) {
  return personalAccessTokenSchema.parse({
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    createdAt: toIsoString(token.createdAt),
    lastUsedAt: toNullableIsoString(token.lastUsedAt),
    revokedAt: toNullableIsoString(token.revokedAt),
  });
}

authV1Routes.get("/auth/session", async (c) => {
  const result = await authenticateRequest(c.req.raw.headers);

  return c.json(authSessionSchema.parse({
    viewer: result.user,
    authMode: result.authMode,
    auth: buildAuthStatus(),
  }));
});

authV1Routes.get("/auth/tokens", requireAuth, async (c) => {
  const user = c.get("user");

  const tokens = await db
    .select()
    .from(schema.personalAccessTokens)
    .where(eq(schema.personalAccessTokens.userId, user.id))
    .orderBy(desc(schema.personalAccessTokens.createdAt));

  return c.json(tokens.map(serializePersonalAccessToken));
});

authV1Routes.post("/auth/tokens", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = await parseJsonBody(c, createPersonalAccessTokenBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const token = createPersonalAccessTokenValue();
  const now = new Date();
  const record = {
    id: newId(),
    userId: user.id,
    name: parsed.data.name.trim(),
    tokenPrefix: getPersonalAccessTokenPrefix(token),
    tokenHash: hashPersonalAccessToken(token),
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.insert(schema.personalAccessTokens).values(record);

  return c.json(createdPersonalAccessTokenSchema.parse({
    ...serializePersonalAccessToken(record),
    token,
  }), 201);
});

authV1Routes.delete("/auth/tokens/:tokenId", requireAuth, async (c) => {
  const user = c.get("user");
  const tokenId = c.req.param("tokenId");

  const token = await db
    .select()
    .from(schema.personalAccessTokens)
    .where(eq(schema.personalAccessTokens.id, tokenId))
    .get();

  if (!token || token.userId !== user.id) {
    return jsonError(c, 404, "not_found", "Personal access token not found.");
  }

  await db
    .update(schema.personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.personalAccessTokens.id, tokenId))
    .run();

  return c.json({ ok: true });
});
