import assert from "node:assert/strict";
import test from "node:test";
import { serializeRetroItemsForUser } from "./retro-items.ts";

test("serializeRetroItemsForUser aggregates all votes and marks the viewer's vote", () => {
  const result = serializeRetroItemsForUser({
    userId: "user-1",
    sessionPhase: "action",
    items: [
      {
        id: "item-1",
        sessionId: "session-1",
        authorId: "user-1",
        type: "good",
        content: "Fast feedback loops",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: "item-2",
        sessionId: "session-1",
        authorId: "user-2",
        type: "bad",
        content: "Deploys dragged",
        createdAt: new Date("2026-04-01T00:01:00.000Z"),
      },
    ],
    voteRows: [
      { itemId: "item-1", userId: "user-1", value: 1 },
      { itemId: "item-1", userId: "user-2", value: 1 },
      { itemId: "item-2", userId: "user-1", value: -1 },
      { itemId: "item-2", userId: "user-3", value: 1 },
    ],
  });

  assert.equal(result[0]?.voteCount, 2);
  assert.equal(result[0]?.userVote, 1);
  assert.equal(result[0]?.authorId, "user-1");
  assert.equal(result[0]?.isOwn, true);

  assert.equal(result[1]?.voteCount, 0);
  assert.equal(result[1]?.userVote, -1);
  assert.equal(result[1]?.authorId, "user-2");
  assert.equal(result[1]?.isOwn, false);
});

test("serializeRetroItemsForUser hides authors during ideation", () => {
  const result = serializeRetroItemsForUser({
    userId: "user-1",
    sessionPhase: "ideation",
    items: [
      {
        id: "item-1",
        sessionId: "session-1",
        authorId: "user-2",
        type: "good",
        content: "Good thing",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    ],
    voteRows: [],
  });

  assert.equal(result[0]?.authorId, null);
  assert.equal(result[0]?.voteCount, 0);
  assert.equal(result[0]?.userVote, 0);
});
