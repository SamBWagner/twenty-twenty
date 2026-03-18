import type { Context } from "hono";
import { eq, and } from "drizzle-orm";
import { auth } from "../auth/index.js";
import { db, schema } from "../db/index.js";
import { joinRoom, leaveRoom } from "./rooms.js";

export function createWsHandler(upgradeWebSocket: Function) {
  return upgradeWebSocket(async (c: Context) => {
    const sessionId = c.req.query("sessionId");

    // Authenticate via session cookie
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    const user = sessionData?.user;

    return {
      onOpen(_event: unknown, ws: any) {
        if (!sessionId || !user) {
          ws.close(1008, "Unauthorized");
          return;
        }
        joinRoom(sessionId, {
          userId: user.id,
          username: user.name || "Anonymous",
          avatarUrl: user.image || null,
        }, ws);

        // Record attendance
        recordAttendance(sessionId, user.id).catch(() => {});
      },
      onClose() {
        if (sessionId && user) {
          leaveRoom(sessionId, user.id);
        }
      },
    };
  });
}

async function recordAttendance(sessionId: string, userId: string) {
  const session = await db
    .select({ projectId: schema.retroSessions.projectId })
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.id, sessionId))
    .get();

  if (!session) return;

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

  await db
    .insert(schema.sessionParticipants)
    .values({
      sessionId,
      userId,
      role: membership ? "member" : "guest",
      joinedAt: new Date(),
    })
    .onConflictDoNothing();
}
