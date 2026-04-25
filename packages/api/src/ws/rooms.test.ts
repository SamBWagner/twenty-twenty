import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  broadcast,
  getRoomStats,
  joinRoom,
  leaveRoom,
  pruneDeadConnections,
  resetRoomsForTest,
} from "./rooms.ts";

class FakeWs {
  readyState = 1;
  sent: string[] = [];
  pings = 0;
  terminated = false;
  private listeners = new Map<string, Set<() => void>>();

  raw = {
    ping: () => {
      this.pings += 1;
    },
    terminate: () => {
      this.terminated = true;
      this.readyState = 3;
    },
    on: (event: "pong", handler: () => void) => {
      const handlers = this.listeners.get(event) || new Set<() => void>();
      handlers.add(handler);
      this.listeners.set(event, handlers);
    },
    off: (event: "pong", handler: () => void) => {
      this.listeners.get(event)?.delete(handler);
    },
  };

  send(message: string) {
    if (this.readyState !== 1) {
      throw new Error("socket closed");
    }
    this.sent.push(message);
  }

  emitPong() {
    for (const handler of this.listeners.get("pong") || []) {
      handler();
    }
  }
}

function wsContext(ws: FakeWs) {
  return ws as unknown as Parameters<typeof joinRoom>[2];
}

function messages(ws: FakeWs, type: string) {
  return ws.sent
    .map((message) => JSON.parse(message) as { type: string; payload: any })
    .filter((message) => message.type === type);
}

afterEach(() => {
  resetRoomsForTest();
});

test("rooms track connections separately and dedupe presence by user", () => {
  const firstAliceWs = new FakeWs();
  const bobWs = new FakeWs();
  const secondAliceWs = new FakeWs();

  const firstAliceConnectionId = joinRoom(
    "session-1",
    { userId: "alice", username: "Alice", avatarUrl: null },
    wsContext(firstAliceWs),
  );
  joinRoom(
    "session-1",
    { userId: "bob", username: "Bob", avatarUrl: null },
    wsContext(bobWs),
  );
  const secondAliceConnectionId = joinRoom(
    "session-1",
    { userId: "alice", username: "Alice", avatarUrl: null },
    wsContext(secondAliceWs),
  );

  assert.deepEqual(getRoomStats(), {
    roomCount: 1,
    connectionCount: 3,
    uniqueUserCount: 2,
  });
  assert.equal(messages(bobWs, "user:joined").filter((message) => message.payload.userId === "alice").length, 0);

  const secondAliceSync = messages(secondAliceWs, "presence:sync").at(-1);
  assert.deepEqual(
    secondAliceSync?.payload.users.map((user: { userId: string }) => user.userId).sort(),
    ["alice", "bob"],
  );

  leaveRoom("session-1", firstAliceConnectionId);
  assert.equal(messages(bobWs, "user:left").filter((message) => message.payload.userId === "alice").length, 0);

  leaveRoom("session-1", secondAliceConnectionId);
  assert.equal(messages(bobWs, "user:left").filter((message) => message.payload.userId === "alice").length, 1);
});

test("broadcast prunes stale connections without dropping live users", () => {
  const staleWs = new FakeWs();
  const liveWs = new FakeWs();

  joinRoom("session-1", { userId: "stale", username: "Stale", avatarUrl: null }, wsContext(staleWs));
  joinRoom("session-1", { userId: "live", username: "Live", avatarUrl: null }, wsContext(liveWs));
  staleWs.readyState = 3;

  broadcast("session-1", { type: "phase:changed", payload: { phase: "action" } });

  assert.deepEqual(getRoomStats(), {
    roomCount: 1,
    connectionCount: 1,
    uniqueUserCount: 1,
  });
  assert.equal(messages(liveWs, "phase:changed").length, 1);
  assert.equal(messages(liveWs, "user:left").at(-1)?.payload.userId, "stale");
});

test("heartbeat terminates connections that stop responding", () => {
  const ws = new FakeWs();
  joinRoom("session-1", { userId: "alice", username: "Alice", avatarUrl: null }, wsContext(ws));

  pruneDeadConnections();
  assert.equal(ws.pings, 1);
  assert.equal(ws.terminated, false);
  assert.equal(getRoomStats().connectionCount, 1);

  pruneDeadConnections();
  assert.equal(ws.terminated, true);
  assert.deepEqual(getRoomStats(), {
    roomCount: 0,
    connectionCount: 0,
    uniqueUserCount: 0,
  });
});

test("heartbeat keeps a connection alive when it receives pong", () => {
  const ws = new FakeWs();
  joinRoom("session-1", { userId: "alice", username: "Alice", avatarUrl: null }, wsContext(ws));

  pruneDeadConnections();
  ws.emitPong();
  pruneDeadConnections();

  assert.equal(ws.pings, 2);
  assert.equal(ws.terminated, false);
  assert.equal(getRoomStats().connectionCount, 1);
});
