import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { loadAuthSession, resetAuthSessionCacheForTest } from "./client-auth.tsx";

const originalFetch = globalThis.fetch;

function authSessionResponse() {
  return new Response(JSON.stringify({
    viewer: {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      image: null,
    },
    authMode: "session",
    auth: {
      githubConfigured: true,
      authSecretConfigured: true,
      readyForOAuth: true,
      missingEnvVars: [],
      callbackUrl: "http://localhost:3001/api/auth/callback/github",
      apiUrl: "http://localhost:3001",
      webUrl: "http://localhost:4321",
      trustedOrigins: ["http://localhost:4321"],
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  resetAuthSessionCacheForTest();
  globalThis.fetch = originalFetch;
});

test("loadAuthSession shares in-flight and recently cached requests", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return authSessionResponse();
  };

  const [first, second] = await Promise.all([
    loadAuthSession(),
    loadAuthSession(),
  ]);
  const third = await loadAuthSession();

  assert.equal(fetchCount, 1);
  assert.equal(first.viewer?.id, "user-1");
  assert.equal(second.viewer?.id, "user-1");
  assert.equal(third.viewer?.id, "user-1");
});
