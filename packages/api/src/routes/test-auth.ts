import { Hono } from "hono";
import { db } from "../db/index.js";
import { sql, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { auth } from "../auth/index.js";

const testAuthRoutes = new Hono();

// Guard: only available when TEST_AUTH_BYPASS is enabled
testAuthRoutes.use("/test-auth/*", async (c, next) => {
  if (process.env.TEST_AUTH_BYPASS !== "true") {
    return c.notFound();
  }
  await next();
});

// Seed a test user via better-auth's email+password signup.
// Returns user ID and forwards the signed session cookie.
testAuthRoutes.post("/test-auth/seed", async (c) => {
  const body = await c.req.json<{ name: string; email: string; image?: string }>();

  // Use better-auth's signUp API to create user + session with proper signed cookies
  const signUpResponse = await auth.api.signUpEmail({
    body: {
      name: body.name,
      email: body.email,
      password: "test-password-e2e",
    },
    asResponse: true,
  });

  if (!signUpResponse.ok) {
    const err = await signUpResponse.text();
    return c.json({ error: `signUp failed: ${err}` }, 500);
  }

  // Forward all Set-Cookie headers from better-auth
  const setCookies = signUpResponse.headers.getSetCookie();
  for (const cookie of setCookies) {
    c.header("Set-Cookie", cookie, { append: true });
  }

  const data = await signUpResponse.json();

  return c.json({
    userId: data.user?.id,
  });
});

// Reset all database tables for test isolation
testAuthRoutes.post("/test-auth/reset-db", async (c) => {
  // Delete in FK-dependency order (children first)
  const tables = [
    "action_reviews",
    "actions",
    "bundle_items",
    "bundles",
    "votes",
    "items",
    "session_participants",
    "retro_sessions",
    "project_invitations",
    "project_members",
    "projects",
    "verification",
    "session",
    "account",
    "user",
  ];

  for (const table of tables) {
    db.run(sql.raw(`DELETE FROM "${table}"`));
  }

  return c.json({ ok: true });
});

// Get invitation token by invitation ID (test-only, since the real API hides tokens)
testAuthRoutes.get("/test-auth/invitation-token/:id", async (c) => {
  const id = c.req.param("id");
  const invitation = await db
    .select({ token: schema.projectInvitations.token })
    .from(schema.projectInvitations)
    .where(eq(schema.projectInvitations.id, id))
    .get();

  if (!invitation) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  return c.json({ token: invitation.token });
});

export { testAuthRoutes };
