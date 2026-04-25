import type { WSContext } from "hono/ws";
import type { WsEvent } from "@twenty-twenty/shared";

interface RawWebSocketLike {
  ping?: () => void;
  terminate?: () => void;
  on?: (event: "pong", handler: () => void) => void;
  off?: (event: "pong", handler: () => void) => void;
}

interface ConnectedConnection {
  connectionId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  ws: WSContext;
  isAlive: boolean;
  onPong: () => void;
}

interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

const OPEN_READY_STATE = 1;
const HEARTBEAT_INTERVAL_MS = 30_000;

const rooms = new Map<string, Map<string, ConnectedConnection>>();
let nextConnectionId = 0;

function createConnectionId() {
  nextConnectionId += 1;
  return `${Date.now().toString(36)}-${nextConnectionId.toString(36)}`;
}

function rawWebSocket(ws: WSContext): RawWebSocketLike | undefined {
  return ws.raw as RawWebSocketLike | undefined;
}

function hasUser(room: Map<string, ConnectedConnection>, userId: string) {
  for (const conn of room.values()) {
    if (conn.userId === userId && conn.ws.readyState === OPEN_READY_STATE) return true;
  }
  return false;
}

function buildPresenceUsers(room: Map<string, ConnectedConnection>): PresenceUser[] {
  const usersById = new Map<string, PresenceUser>();
  for (const conn of room.values()) {
    if (conn.ws.readyState !== OPEN_READY_STATE) continue;
    usersById.set(conn.userId, {
      userId: conn.userId,
      username: conn.username,
      avatarUrl: conn.avatarUrl,
    });
  }
  return Array.from(usersById.values());
}

function detachConnection(conn: ConnectedConnection) {
  rawWebSocket(conn.ws)?.off?.("pong", conn.onPong);
}

function terminateConnection(conn: ConnectedConnection) {
  rawWebSocket(conn.ws)?.terminate?.();
}

function removeConnection(sessionId: string, connectionId: string, notifyPresence: boolean) {
  const room = rooms.get(sessionId);
  if (!room) return;

  const conn = room.get(connectionId);
  if (!conn) return;

  room.delete(connectionId);
  detachConnection(conn);

  if (room.size === 0) {
    rooms.delete(sessionId);
    return;
  }

  if (notifyPresence && !hasUser(room, conn.userId)) {
    broadcast(sessionId, { type: "user:left", payload: { userId: conn.userId } });
  }
}

export function joinRoom(
  sessionId: string,
  user: { userId: string; username: string; avatarUrl: string | null },
  ws: WSContext,
): string {
  if (!rooms.has(sessionId)) {
    rooms.set(sessionId, new Map());
  }
  const room = rooms.get(sessionId)!;
  const hadUser = hasUser(room, user.userId);
  const connectionId = createConnectionId();
  const conn: ConnectedConnection = {
    connectionId,
    ...user,
    ws,
    isAlive: true,
    onPong: () => {
      conn.isAlive = true;
    },
  };

  rawWebSocket(ws)?.on?.("pong", conn.onPong);
  room.set(connectionId, conn);

  // Notify others
  if (!hadUser) {
    broadcast(sessionId, {
      type: "user:joined",
      payload: { userId: user.userId, username: user.username, avatarUrl: user.avatarUrl },
    }, user.userId);
  }

  // Send presence sync to the new user
  const users = buildPresenceUsers(room);
  try {
    ws.send(JSON.stringify({ type: "presence:sync", payload: { users } }));
  } catch {
    removeConnection(sessionId, connectionId, true);
  }

  return connectionId;
}

export function leaveRoom(sessionId: string, connectionId: string) {
  removeConnection(sessionId, connectionId, true);
}

export function broadcast(sessionId: string, event: WsEvent, excludeUserId?: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  const message = JSON.stringify(event);
  const deadConnectionIds: string[] = [];
  for (const [connectionId, conn] of room) {
    if (conn.userId === excludeUserId) continue;
    if (conn.ws.readyState !== OPEN_READY_STATE) {
      deadConnectionIds.push(connectionId);
      continue;
    }

    try {
      conn.ws.send(message);
    } catch {
      deadConnectionIds.push(connectionId);
    }
  }

  for (const connectionId of deadConnectionIds) {
    removeConnection(sessionId, connectionId, true);
  }
}

export function pruneDeadConnections() {
  for (const [sessionId, room] of rooms) {
    const deadConnectionIds: string[] = [];

    for (const [connectionId, conn] of room) {
      if (conn.ws.readyState !== OPEN_READY_STATE || !conn.isAlive) {
        terminateConnection(conn);
        deadConnectionIds.push(connectionId);
        continue;
      }

      conn.isAlive = false;
      rawWebSocket(conn.ws)?.ping?.();
    }

    for (const connectionId of deadConnectionIds) {
      removeConnection(sessionId, connectionId, true);
    }
  }
}

export function getRoomStats() {
  let connectionCount = 0;
  let uniqueUserCount = 0;

  for (const room of rooms.values()) {
    connectionCount += room.size;
    uniqueUserCount += buildPresenceUsers(room).length;
  }

  return {
    roomCount: rooms.size,
    connectionCount,
    uniqueUserCount,
  };
}

export function resetRoomsForTest() {
  rooms.clear();
  nextConnectionId = 0;
}

setInterval(pruneDeadConnections, HEARTBEAT_INTERVAL_MS).unref();
