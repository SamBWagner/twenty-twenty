import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const TOKEN_PREFIX = "tt_pat_";

export function createPersonalAccessTokenValue(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashPersonalAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getPersonalAccessTokenPrefix(token: string): string {
  return token.slice(0, Math.min(token.length, 14));
}

export function extractBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (!authorization) return null;

  const [scheme, value] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value?.trim()) {
    return null;
  }

  return value.trim();
}

export async function findPersonalAccessToken(token: string) {
  const tokenHash = hashPersonalAccessToken(token);

  return db
    .select()
    .from(schema.personalAccessTokens)
    .where(
      and(
        eq(schema.personalAccessTokens.tokenHash, tokenHash),
        isNull(schema.personalAccessTokens.revokedAt),
      ),
    )
    .get();
}

export async function markPersonalAccessTokenUsed(id: string) {
  await db
    .update(schema.personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.personalAccessTokens.id, id))
    .run();
}
