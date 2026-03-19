import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApiRequestHeaders,
  clearRequestAuthCache,
  resolveRequestAuth,
} from "./auth.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRequestAuthCache();
  delete process.env.API_URL;
});

test("buildApiRequestHeaders forwards the cookie and proxy headers", () => {
  const requestHeaders = new Headers({
    cookie: "better-auth.session_token=session-token",
    "fly-client-ip": "198.51.100.10",
    "x-forwarded-for": "203.0.113.5",
    "x-real-ip": "198.51.100.10",
  });

  const headers = buildApiRequestHeaders(requestHeaders);

  assert.equal(headers.get("cookie"), "better-auth.session_token=session-token");
  assert.equal(headers.get("fly-client-ip"), "198.51.100.10");
  assert.equal(headers.get("x-forwarded-for"), "203.0.113.5");
  assert.equal(headers.get("x-real-ip"), "198.51.100.10");
});

test("resolveRequestAuth caches repeated authenticated session lookups", async () => {
  process.env.API_URL = "http://unit.test";

  const seenHeaders: Array<{
    cookie: string | null;
    xForwardedFor: string | null;
  }> = [];
  let callCount = 0;

  globalThis.fetch = async (_input, init) => {
    callCount += 1;
    const headers = new Headers(init?.headers);
    seenHeaders.push({
      cookie: headers.get("cookie"),
      xForwardedFor: headers.get("x-forwarded-for"),
    });

    return new Response(JSON.stringify({
      user: {
        id: "user-1",
        name: "Debug User",
        email: "debug@example.com",
        image: null,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const requestHeaders = new Headers({
    cookie: "better-auth.session_token=session-123",
    "x-forwarded-for": "203.0.113.10",
  });

  const first = await resolveRequestAuth(requestHeaders);
  const second = await resolveRequestAuth(requestHeaders);

  assert.equal(first.state, "authenticated");
  assert.equal(second.state, "authenticated");
  assert.equal(callCount, 1);
  assert.deepEqual(seenHeaders, [{
    cookie: "better-auth.session_token=session-123",
    xForwardedFor: "203.0.113.10",
  }]);
});

test("resolveRequestAuth returns a cached rate-limited state with Retry-After details", async () => {
  process.env.API_URL = "http://unit.test";

  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "7",
      },
    });
  };

  const requestHeaders = new Headers({
    "x-forwarded-for": "198.51.100.10",
  });

  const first = await resolveRequestAuth(requestHeaders);
  const second = await resolveRequestAuth(requestHeaders);

  assert.deepEqual(first, {
    state: "rate_limited",
    user: null,
    retryAfterSeconds: 7,
  });
  assert.deepEqual(second, first);
  assert.equal(callCount, 1);
});

test("resolveRequestAuth returns anonymous when get-session succeeds without a user", async () => {
  process.env.API_URL = "http://unit.test";

  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const auth = await resolveRequestAuth(new Headers({
    "x-forwarded-for": "203.0.113.44",
  }));

  assert.deepEqual(auth, {
    state: "anonymous",
    user: null,
  });
});
