import type { Context } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { eq, and } from "drizzle-orm";
import { authenticateRequest } from "../auth/middleware.js";
import { db, schema } from "../db/index.js";
import { joinRoom, leaveRoom } from "./rooms.js";

export function createWsHandler(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket(async (c: Context) => {
    const sessionId = c.req.query("sessionId");

    const auth = await authenticateRequest(c.req.raw.headers);
    const user = auth.user;
    let connectionId: string | null = null;

    return {
      onOpen(_event: unknown, ws: any) {
        if (!sessionId || !user) {
          ws.close(1008, "Unauthorized");
          return;
        }
        connectionId = joinRoom(sessionId, {
          userId: user.id,
          username: user.name || "Anonymous",
          avatarUrl: user.image || null,
        }, ws);

        // Record attendance for active sessions only.
        recordAttendance(sessionId, user.id).catch(() => {});
      },
      onClose() {
        if (sessionId && connectionId) {
          leaveRoom(sessionId, connectionId);
          connectionId = null;
        }
      },
      onError() {
        if (sessionId && connectionId) {
          leaveRoom(sessionId, connectionId);
          connectionId = null;
        }
      },
    };
  });
}

export async function recordAttendance(sessionId: string, userId: string) {
  const session = await db
    .select({
      projectId: schema.retroSessions.projectId,
      phase: schema.retroSessions.phase,
    })
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.id, sessionId))
    .get();

  if (!session) return;
  if (session.phase === "closed") return;

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
