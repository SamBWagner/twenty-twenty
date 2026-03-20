import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

const databasePath = path.join(
  os.tmpdir(),
  `twenty-twenty-summary-share-${process.pid}-${Date.now()}.db`,
);

process.env.TEST_AUTH_BYPASS = "true";
process.env.BETTER_AUTH_SECRET = "test-secret-value-with-32-characters";
process.env.DATABASE_PATH = databasePath;
process.env.WEB_URL = "http://localhost:4321";
process.env.API_URL = "http://localhost:3001";
process.env.BETTER_AUTH_URL = "http://localhost:3001";

function runMigrations() {
  const sqlite = new Database(databasePath);
  const migrationsDir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      sqlite.exec(statement);
    }
  }

  sqlite.close();
}

runMigrations();

const { createApp } = await import("../app.ts");
const { db, schema } = await import("../db/index.ts");
const { recordAttendance } = await import("../ws/handler.ts");

const app = createApp({ disableRateLimit: true });

function extractCookieHeader(response: Response): string {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean) as string[];

  return setCookies
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function requestJson(pathname: string, init?: RequestInit) {
  return app.request(`http://localhost${pathname}`, init);
}

async function resetDb() {
  const response = await requestJson("/api/test-auth/reset-db", { method: "POST" });
  assert.equal(response.status, 200);
}

async function seedUser(name: string, email: string) {
  const response = await requestJson("/api/test-auth/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { userId: string };
  return {
    userId: body.userId,
    cookieHeader: extractCookieHeader(response),
  };
}

async function seedSessionFixture(options: { phase?: "review" | "ideation" | "action" | "closed" } = {}) {
  const phase = options.phase ?? "closed";
  const owner = await seedUser("Owner", `owner-${Date.now()}@test.local`);
  const guest = await seedUser("Guest", `guest-${Date.now()}@test.local`);

  const projectId = "project-1";
  const previousSessionId = "session-previous";
  const sessionId = "session-current";
  const bundleId = "bundle-1";
  const goodItemId = "item-good";
  const badItemId = "item-bad";
  const bundledActionId = "action-bundled";
  const carriedActionId = "action-carried";
  const previousActionId = "action-previous";
  const now = new Date("2026-03-20T00:00:00.000Z");
  const closedAt = phase === "closed" ? new Date(now.getTime() + 30_000) : null;
  const shareToken = "share-current";

  await db.insert(schema.projects).values({
    id: projectId,
    name: "Project Zebra",
    description: null,
    createdBy: owner.userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.projectMembers).values({
    projectId,
    userId: owner.userId,
    role: "owner",
    joinedAt: now,
  });

  await db.insert(schema.retroSessions).values([
    {
      id: previousSessionId,
      projectId,
      name: "Sprint 9 Retro",
      phase: "closed",
      sequence: 1,
      createdBy: owner.userId,
      createdAt: new Date(now.getTime() - 120_000),
      closedAt: new Date(now.getTime() - 90_000),
      shareToken: null,
      summaryShareToken: null,
    },
    {
      id: sessionId,
      projectId,
      name: "Sprint 10 Retro",
      phase,
      sequence: 2,
      createdBy: owner.userId,
      createdAt: new Date(now.getTime() - 60_000),
      closedAt,
      shareToken,
      summaryShareToken: null,
    },
  ]);

  await db.insert(schema.sessionParticipants).values([
    {
      sessionId,
      userId: owner.userId,
      role: "member",
      joinedAt: now,
    },
    {
      sessionId,
      userId: guest.userId,
      role: "guest",
      joinedAt: new Date(now.getTime() + 1_000),
    },
  ]);

  await db.insert(schema.items).values([
    {
      id: goodItemId,
      sessionId,
      authorId: owner.userId,
      type: "good",
      content: "Pairing kept momentum high",
      createdAt: now,
    },
    {
      id: badItemId,
      sessionId,
      authorId: guest.userId,
      type: "bad",
      content: "CI stayed flaky",
      createdAt: new Date(now.getTime() + 1_000),
    },
  ]);

  await db.insert(schema.votes).values([
    {
      id: "vote-1",
      itemId: goodItemId,
      userId: owner.userId,
      value: 1,
      createdAt: now,
    },
    {
      id: "vote-2",
      itemId: goodItemId,
      userId: guest.userId,
      value: 1,
      createdAt: new Date(now.getTime() + 500),
    },
    {
      id: "vote-3",
      itemId: badItemId,
      userId: owner.userId,
      value: 1,
      createdAt: new Date(now.getTime() + 1_500),
    },
  ]);

  await db.insert(schema.bundles).values({
    id: bundleId,
    sessionId,
    label: "Build Stability",
    createdAt: new Date(now.getTime() + 2_000),
  });

  await db.insert(schema.bundleItems).values([
    {
      bundleId,
      itemId: goodItemId,
    },
    {
      bundleId,
      itemId: badItemId,
    },
  ]);

  await db.insert(schema.actions).values([
    {
      id: previousActionId,
      sessionId: previousSessionId,
      bundleId: null,
      description: "Repair the flaky pipeline",
      assigneeId: owner.userId,
      createdAt: new Date(now.getTime() - 100_000),
    },
    {
      id: bundledActionId,
      sessionId,
      bundleId,
      description: "Add a CI smoke test",
      assigneeId: owner.userId,
      createdAt: new Date(now.getTime() + 3_000),
    },
    {
      id: carriedActionId,
      sessionId,
      bundleId: null,
      description: "Track the remaining flaky suites",
      assigneeId: null,
      createdAt: new Date(now.getTime() + 4_000),
    },
  ]);

  await db.insert(schema.actionReviews).values({
    id: "review-1",
    actionId: previousActionId,
    sessionId,
    reviewerId: owner.userId,
    status: "actioned",
    comment: "This helped a lot.",
    createdAt: new Date(now.getTime() + 5_000),
  });

  return {
    owner,
    guest,
    projectId,
    sessionId,
    shareToken,
    closedAt,
  };
}

beforeEach(async () => {
  await resetDb();
});

after(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

test("project members can create and reuse a summary share token for a closed session", async () => {
  const { owner, sessionId } = await seedSessionFixture();

  const firstResponse = await requestJson(`/api/v1/sessions/${sessionId}/summary-share`, {
    method: "POST",
    headers: { Cookie: owner.cookieHeader },
  });
  assert.equal(firstResponse.status, 200);

  const firstBody = await firstResponse.json() as { summaryShareToken: string };
  assert.ok(firstBody.summaryShareToken);

  const secondResponse = await requestJson(`/api/v1/sessions/${sessionId}/summary-share`, {
    method: "POST",
    headers: { Cookie: owner.cookieHeader },
  });
  assert.equal(secondResponse.status, 200);

  const secondBody = await secondResponse.json() as { summaryShareToken: string };
  assert.equal(secondBody.summaryShareToken, firstBody.summaryShareToken);
});

test("non-members cannot mint summary share tokens", async () => {
  const { sessionId } = await seedSessionFixture();
  const outsider = await seedUser("Outsider", `outsider-${Date.now()}@test.local`);

  const response = await requestJson(`/api/v1/sessions/${sessionId}/summary-share`, {
    method: "POST",
    headers: { Cookie: outsider.cookieHeader },
  });

  assert.equal(response.status, 404);
});

test("summary share token creation is rejected for sessions that are not closed", async () => {
  const { owner, sessionId } = await seedSessionFixture({ phase: "action" });

  const response = await requestJson(`/api/v1/sessions/${sessionId}/summary-share`, {
    method: "POST",
    headers: { Cookie: owner.cookieHeader },
  });

  assert.equal(response.status, 400);
});

test("public summary links return a readonly payload without internal ids", async () => {
  const { owner, sessionId } = await seedSessionFixture();

  const shareResponse = await requestJson(`/api/v1/sessions/${sessionId}/summary-share`, {
    method: "POST",
    headers: { Cookie: owner.cookieHeader },
  });
  const { summaryShareToken } = await shareResponse.json() as { summaryShareToken: string };

  const publicResponse = await requestJson(`/api/v1/sessions/summary-share/${summaryShareToken}`);
  assert.equal(publicResponse.status, 200);

  const payload = await publicResponse.json() as Record<string, any>;
  assert.equal(payload.session.name, "Sprint 10 Retro");
  assert.equal(payload.participants[0].username, "Owner");
  assert.deepEqual(payload.participants.map((participant: { username: string }) => participant.username), ["Owner", "Guest"]);
  assert.equal(payload.goodItems[0].content, "Pairing kept momentum high");
  assert.equal(payload.goodItems[0].voteCount, 2);
  assert.equal(payload.actionGroups[0].label, "Build Stability");
  assert.equal(payload.carriedOverActions[0].description, "Track the remaining flaky suites");
  assert.equal(payload.reviews[0].reviewerName, "Owner");
  assert.equal(payload.actionCount, 2);

  assert.equal("userId" in payload.participants[0], false);
  assert.equal("id" in payload.goodItems[0], false);
  assert.equal("reviewerId" in payload.reviews[0], false);
});

test("invalid public summary tokens return 404", async () => {
  const response = await requestJson("/api/v1/sessions/summary-share/not-a-real-token");
  assert.equal(response.status, 404);
});

test("late participant rows are excluded from closed-session summaries", async () => {
  const { owner, sessionId, closedAt } = await seedSessionFixture();
  assert.ok(closedAt);

  const lateUser = await seedUser("Late Guest", `late-${Date.now()}@test.local`);

  await db.insert(schema.sessionParticipants).values({
    sessionId,
    userId: lateUser.userId,
    role: "guest",
    joinedAt: new Date(closedAt.getTime() + 1_000),
  });

  const memberSummaryResponse = await requestJson(`/api/v1/sessions/${sessionId}/summary`, {
    headers: { Cookie: owner.cookieHeader },
  });
  assert.equal(memberSummaryResponse.status, 200);

  const memberSummary = await memberSummaryResponse.json() as { participants: Array<{ username: string }> };
  assert.deepEqual(memberSummary.participants.map((participant) => participant.username), ["Owner", "Guest"]);

  const shareResponse = await requestJson(`/api/v1/sessions/${sessionId}/summary-share`, {
    method: "POST",
    headers: { Cookie: owner.cookieHeader },
  });
  assert.equal(shareResponse.status, 200);

  const { summaryShareToken } = await shareResponse.json() as { summaryShareToken: string };
  const publicSummaryResponse = await requestJson(`/api/v1/sessions/summary-share/${summaryShareToken}`);
  assert.equal(publicSummaryResponse.status, 200);

  const publicSummary = await publicSummaryResponse.json() as { participants: Array<{ username: string }> };
  assert.deepEqual(publicSummary.participants.map((participant) => participant.username), ["Owner", "Guest"]);
});

test("closed session join links reject new attendees", async () => {
  const { sessionId, shareToken } = await seedSessionFixture();
  const outsider = await seedUser("Outsider", `outsider-${Date.now()}@test.local`);

  const response = await requestJson(`/api/v1/sessions/join/${shareToken}`, {
    method: "POST",
    headers: { Cookie: outsider.cookieHeader },
  });

  assert.equal(response.status, 400);

  const participant = await db
    .select()
    .from(schema.sessionParticipants)
    .where(eq(schema.sessionParticipants.sessionId, sessionId))
    .all();

  assert.equal(participant.some((entry) => entry.userId === outsider.userId), false);
});

test("websocket attendance does not add participants after a session closes", async () => {
  const { sessionId } = await seedSessionFixture();
  const outsider = await seedUser("Outsider", `ws-outsider-${Date.now()}@test.local`);

  await recordAttendance(sessionId, outsider.userId);

  const participant = await db
    .select()
    .from(schema.sessionParticipants)
    .where(eq(schema.sessionParticipants.sessionId, sessionId))
    .all();

  assert.equal(participant.some((entry) => entry.userId === outsider.userId), false);
});
