import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";

const databasePath = path.join(
  os.tmpdir(),
  `twenty-twenty-reviews-${process.pid}-${Date.now()}.db`,
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

async function seedReviewFixture() {
  const owner = await seedUser("Owner", `owner-${Date.now()}@test.local`);
  const member = await seedUser("Member", `member-${Date.now()}@test.local`);
  const projectId = "project-review";
  const previousSessionId = "session-review-previous";
  const sessionId = "session-review-current";
  const previousActionId = "action-review-previous";
  const now = new Date("2026-04-24T00:00:00.000Z");

  await db.insert(schema.projects).values({
    id: projectId,
    name: "Review Project",
    description: null,
    createdBy: owner.userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.projectMembers).values([
    {
      projectId,
      userId: owner.userId,
      role: "owner",
      joinedAt: now,
    },
    {
      projectId,
      userId: member.userId,
      role: "member",
      joinedAt: now,
    },
  ]);

  await db.insert(schema.retroSessions).values([
    {
      id: previousSessionId,
      projectId,
      name: "Previous Retro",
      phase: "closed",
      sequence: 1,
      createdBy: owner.userId,
      createdAt: new Date(now.getTime() - 120_000),
      closedAt: new Date(now.getTime() - 60_000),
      shareToken: null,
      summaryShareToken: null,
    },
    {
      id: sessionId,
      projectId,
      name: "Current Retro",
      phase: "review",
      sequence: 2,
      createdBy: owner.userId,
      createdAt: now,
      closedAt: null,
      shareToken: null,
      summaryShareToken: null,
    },
  ]);

  await db.insert(schema.actions).values({
    id: previousActionId,
    sessionId: previousSessionId,
    bundleId: null,
    description: "Follow up on incident review",
    assigneeId: owner.userId,
    createdAt: new Date(now.getTime() - 30_000),
  });

  return {
    owner,
    member,
    sessionId,
    previousActionId,
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

test("review votes are recorded without finalizing the action", async () => {
  const { member, sessionId, previousActionId } = await seedReviewFixture();

  const voteResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: member.cookieHeader,
    },
    body: JSON.stringify({
      actionId: previousActionId,
      status: "actioned",
    }),
  });

  assert.equal(voteResponse.status, 201);

  const finalReviews = await db
    .select()
    .from(schema.actionReviews)
    .where(eq(schema.actionReviews.sessionId, sessionId));
  assert.equal(finalReviews.length, 0);

  const stateResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews/pending`, {
    headers: { Cookie: member.cookieHeader },
  });
  assert.equal(stateResponse.status, 200);

  const state = await stateResponse.json() as any;
  assert.equal(state.pending.length, 1);
  assert.equal(state.voteTallies[0].tally.actioned, 1);
  assert.equal(state.voteTallies[0].viewerVote.status, "actioned");
});

test("facilitator finalizes the top vote and retrying does not duplicate carried actions", async () => {
  const { owner, member, sessionId, previousActionId } = await seedReviewFixture();

  const voteResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: member.cookieHeader,
    },
    body: JSON.stringify({
      actionId: previousActionId,
      status: "did_nothing",
    }),
  });
  assert.equal(voteResponse.status, 201);

  const finalizeBody = JSON.stringify({ actionId: previousActionId });
  const finalizeResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookieHeader,
    },
    body: finalizeBody,
  });
  assert.equal(finalizeResponse.status, 201);

  const payload = await finalizeResponse.json() as any;
  assert.equal(payload.status, "did_nothing");
  assert.equal(payload.tally.didNothing, 1);

  const retryResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookieHeader,
    },
    body: finalizeBody,
  });
  assert.equal(retryResponse.status, 200);

  const currentActions = await db
    .select()
    .from(schema.actions)
    .where(and(eq(schema.actions.sessionId, sessionId), eq(schema.actions.description, "Follow up on incident review")));
  assert.equal(currentActions.length, 1);

  const session = await db
    .select()
    .from(schema.retroSessions)
    .where(eq(schema.retroSessions.id, sessionId))
    .get();
  assert.equal(session?.phase, "ideation");
});

test("non-facilitators cannot finalize review outcomes", async () => {
  const { member, sessionId, previousActionId } = await seedReviewFixture();

  const response = await requestJson(`/api/v1/sessions/${sessionId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: member.cookieHeader,
    },
    body: JSON.stringify({ actionId: previousActionId }),
  });

  assert.equal(response.status, 403);
});

test("facilitator must break tied review votes", async () => {
  const { owner, member, sessionId, previousActionId } = await seedReviewFixture();

  const ownerVote = await requestJson(`/api/v1/sessions/${sessionId}/reviews/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookieHeader,
    },
    body: JSON.stringify({
      actionId: previousActionId,
      status: "actioned",
    }),
  });
  assert.equal(ownerVote.status, 201);

  const memberVote = await requestJson(`/api/v1/sessions/${sessionId}/reviews/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: member.cookieHeader,
    },
    body: JSON.stringify({
      actionId: previousActionId,
      status: "did_nothing",
    }),
  });
  assert.equal(memberVote.status, 201);

  const tiedResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookieHeader,
    },
    body: JSON.stringify({ actionId: previousActionId }),
  });
  assert.equal(tiedResponse.status, 400);

  const tieBreakResponse = await requestJson(`/api/v1/sessions/${sessionId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookieHeader,
    },
    body: JSON.stringify({ actionId: previousActionId, status: "actioned" }),
  });
  assert.equal(tieBreakResponse.status, 201);

  const payload = await tieBreakResponse.json() as any;
  assert.equal(payload.status, "actioned");
  assert.equal(payload.tally.actioned, 1);
  assert.equal(payload.tally.didNothing, 1);
});
