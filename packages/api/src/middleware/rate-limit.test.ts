import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import {
  deriveRateLimitIdentity,
  hashRateLimitValue,
  rateLimiter,
} from "./rate-limit.ts";

function createTestApp() {
  const app = new Hono();

  app.use(
    "/api/auth/get-session",
    rateLimiter({
      windowMs: 60_000,
      max: 2,
      keyStrategy: "hybrid-session",
      label: "auth:get-session",
    }),
  );
  app.use(
    "/api/auth/status",
    rateLimiter({
      windowMs: 60_000,
      max: 1,
      keyStrategy: "ip",
      label: "auth:status",
    }),
  );
  app.use(
    "/api/*",
    rateLimiter({
      windowMs: 60_000,
      max: 2,
      keyStrategy: "hybrid-session",
      label: "api",
      skip: (c) => c.req.path === "/api/health" || c.req.path.startsWith("/api/auth/"),
    }),
  );

  app.get("/api/auth/get-session", (c) => c.json({ user: null }));
  app.get("/api/auth/status", (c) => c.json({ ok: true }));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/data", (c) => c.json({ ok: true }));

  return app;
}

test("deriveRateLimitIdentity prefers the session token for hybrid-session keys", () => {
  const headers = new Headers({
    cookie: "better-auth.session_token=session%20token",
    "x-forwarded-for": "203.0.113.10",
  });

  const identity = deriveRateLimitIdentity(headers, "hybrid-session");

  assert.deepEqual(identity, {
    key: `session:${hashRateLimitValue("session token")}`,
    keyType: "session",
  });
});

test("deriveRateLimitIdentity uses IPs when the strategy is IP-only", () => {
  const headers = new Headers({
    cookie: "better-auth.session_token=session-token",
    "x-real-ip": "198.51.100.22",
  });

  const identity = deriveRateLimitIdentity(headers, "ip");

  assert.deepEqual(identity, {
    key: "ip:198.51.100.22",
    keyType: "ip",
  });
});

test("different signed-in sessions behind the same NAT do not share the same limiter bucket", async () => {
  const app = createTestApp();
  const sharedIp = "203.0.113.10";

  const firstSessionHeaders = new Headers({
    cookie: "better-auth.session_token=alpha",
    "x-forwarded-for": sharedIp,
  });
  const secondSessionHeaders = new Headers({
    cookie: "better-auth.session_token=beta",
    "x-forwarded-for": sharedIp,
  });

  const responses = await Promise.all([
    app.request("/api/auth/get-session", { headers: firstSessionHeaders }),
    app.request("/api/auth/get-session", { headers: firstSessionHeaders }),
    app.request("/api/auth/get-session", { headers: secondSessionHeaders }),
    app.request("/api/auth/get-session", { headers: secondSessionHeaders }),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 200);
  }
});

test("auth requests do not consume the general API bucket, and 429 responses include rate-limit headers", async () => {
  const app = createTestApp();
  const headers = new Headers({
    cookie: "better-auth.session_token=stable-session",
  });

  await app.request("/api/auth/get-session", { headers });
  await app.request("/api/auth/get-session", { headers });

  const firstApi = await app.request("/api/data", { headers });
  const secondApi = await app.request("/api/data", { headers });
  const thirdApi = await app.request("/api/data", { headers });

  assert.equal(firstApi.status, 200);
  assert.equal(secondApi.status, 200);
  assert.equal(thirdApi.status, 429);
  assert.equal(thirdApi.headers.get("X-RateLimit-Limit"), "2");
  assert.equal(thirdApi.headers.get("X-RateLimit-Remaining"), "0");
  assert.ok(thirdApi.headers.get("X-RateLimit-Reset"));
  assert.ok(thirdApi.headers.get("Retry-After"));
});

test("health checks remain outside the limiter", async () => {
  const app = createTestApp();

  for (let index = 0; index < 5; index += 1) {
    const response = await app.request("/api/health");
    assert.equal(response.status, 200);
  }
});
