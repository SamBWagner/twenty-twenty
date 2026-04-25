import type { BrowserContext } from "@playwright/test";

const API_URL = "http://localhost:3001";
const COOKIE_NAME = "better-auth.session_token";

interface SeedResult {
  userId: string;
  cookie: string; // The full signed cookie value for API calls
}

/**
 * Seed a test user via better-auth's email+password signup.
 * Sets the signed session cookie on the browser context.
 */
export async function loginAsUser(
  context: BrowserContext,
  userInfo: { name: string; email: string; image?: string },
): Promise<SeedResult> {
  const res = await context.request.post(`${API_URL}/api/test-auth/seed`, {
    data: userInfo,
  });

  if (!res.ok()) {
    throw new Error(`Failed to seed user: ${res.status()} ${await res.text()}`);
  }

  const data = await res.json();

  // The Set-Cookie from the API response is automatically applied to the
  // context.request (API) domain. We also need it on the web domain.
  // Extract the cookie value from response headers.
  const rawHeaders = res.headers();
  const setCookieHeader = rawHeaders["set-cookie"] || "";

  // Parse the cookie value
  let cookieValue = "";
  const match = setCookieHeader.match(
    new RegExp(`${COOKIE_NAME.replace(".", "\\.")}=([^;]+)`),
  );
  if (match) {
    cookieValue = decodeURIComponent(match[1]);
  }

  // Set the cookie on the browser context for the web origin (port 4321)
  if (cookieValue) {
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }

  return {
    userId: data.userId,
    cookie: `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
  };
}

export async function loginAsOwner(context: BrowserContext): Promise<SeedResult> {
  return loginAsUser(context, {
    name: "Test Owner",
    email: "owner@test.local",
  });
}

export async function loginAsMember(context: BrowserContext): Promise<SeedResult> {
  return loginAsUser(context, {
    name: "Test Member",
    email: "member@test.local",
  });
}

export async function loginAsGuest(context: BrowserContext): Promise<SeedResult> {
  return loginAsUser(context, {
    name: "Test Guest",
    email: "guest@test.local",
  });
}
