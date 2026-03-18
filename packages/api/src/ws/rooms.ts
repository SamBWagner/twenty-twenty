import type { WSContext } from "hono/ws";
import type { WsEvent } from "@twenty-twenty/shared";

interface ConnectedUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
  ws: WSContext;
}

const rooms = new Map<string, Map<string, ConnectedUser>>();

export function joinRoom(
  sessionId: string,
  user: { userId: string; username: string; avatarUrl: string | null },
  ws: WSContext,
) {
  if (!rooms.has(sessionId)) {
    rooms.set(sessionId, new Map());
  }
  const room = rooms.get(sessionId)!;
  room.set(user.userId, { ...user, ws });

  // Notify others
  broadcast(sessionId, {
    type: "user:joined",
    payload: { userId: user.userId, username: user.username, avatarUrl: user.avatarUrl },
  }, user.userId);

  // Send presence sync to the new user
  const users = Array.from(room.values()).map((u) => ({
    userId: u.userId,
    username: u.username,
    avatarUrl: u.avatarUrl,
  }));
  ws.send(JSON.stringify({ type: "presence:sync", payload: { users } }));
}

export function leaveRoom(sessionId: string, userId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  room.delete(userId);
  if (room.size === 0) {
    rooms.delete(sessionId);
  } else {
    broadcast(sessionId, { type: "user:left", payload: { userId } });
  }
}

export function broadcast(sessionId: string, event: WsEvent, excludeUserId?: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  const message = JSON.stringify(event);
  for (const [userId, conn] of room) {
    if (userId === excludeUserId) continue;
    try {
      conn.ws.send(message);
    } catch {
      // Connection might be dead, clean up
      room.delete(userId);
    }
  }
}
