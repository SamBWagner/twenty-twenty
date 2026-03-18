import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export async function canAccessSession(
  userId: string,
  sessionId: string,
): Promise<{ allowed: boolean; isGuest: boolean; projectId: string | null }> {
  const session = await db
    .select({ projectId: schema.retroSessions.projectId })
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.id, sessionId))
    .get();

  if (!session) return { allowed: false, isGuest: false, projectId: null };

  // Check project membership first
  const membership = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(
        eq(schema.projectMembers.projectId, session.projectId),
        eq(schema.projectMembers.userId, userId),
      ),
    )
    .get();

  if (membership) return { allowed: true, isGuest: false, projectId: session.projectId };

  // Check session guest access
  const participant = await db
    .select()
    .from(schema.sessionParticipants)
    .where(
      and(
        eq(schema.sessionParticipants.sessionId, sessionId),
        eq(schema.sessionParticipants.userId, userId),
        eq(schema.sessionParticipants.role, "guest"),
      ),
    )
    .get();

  if (participant) return { allowed: true, isGuest: true, projectId: session.projectId };

  return { allowed: false, isGuest: false, projectId: session.projectId };
}
