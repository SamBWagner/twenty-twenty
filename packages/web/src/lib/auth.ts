import { createHash } from "node:crypto";

const SESSION_COOKIE_NAME = "better-auth.session_token";
const AUTH_CACHE_TTLS = {
  authenticated: 30_000,
  anonymous: 5_000,
  rate_limited: 5_000,
  error: 5_000,
} as const;

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name) continue;

    const rawValue = rawValueParts.join("=");
    if (!rawValue) return null;
    return decodeCookieValue(rawValue);
  }

  return null;
}

function extractClientIp(headers: Headers): string | null {
  return headers.get("fly-client-ip")
    || headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || null;
}

function getCacheKey(requestHeaders: Headers): string | null {
  const sessionToken = extractCookieValue(requestHeaders.get("cookie"), SESSION_COOKIE_NAME);
  if (sessionToken) {
    return `session:${hashValue(sessionToken)}`;
  }

  const ip = extractClientIp(requestHeaders);
  if (ip) {
    return `ip:${hashValue(ip)}`;
  }

  return null;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export type RequestAuthState = "authenticated" | "anonymous" | "rate_limited" | "error";

export interface RequestAuthResult {
  state: RequestAuthState;
  user: User | null;
  retryAfterSeconds?: number;
}

interface CachedAuthResult {
  expiresAt: number;
  value: RequestAuthResult;
}

const authCache = new Map<string, CachedAuthResult>();

function readCachedAuth(cacheKey: string | null): RequestAuthResult | null {
  if (!cacheKey) return null;

  const cached = authCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() >= cached.expiresAt) {
    authCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function writeCachedAuth(cacheKey: string | null, value: RequestAuthResult) {
  if (!cacheKey) return;

  authCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + AUTH_CACHE_TTLS[value.state],
  });
}

export function clearRequestAuthCache() {
  authCache.clear();
}

export function getServerApiBaseUrl(): string {
  return process.env.API_URL || "http://localhost:3001";
}

export function buildApiRequestHeaders(
  requestHeaders: Headers,
  options: { includeCookie?: boolean } = {},
): Headers {
  const headers = new Headers();

  if (options.includeCookie !== false) {
    const cookie = requestHeaders.get("cookie");
    if (cookie) headers.set("cookie", cookie);
  }

  for (const headerName of ["fly-client-ip", "x-forwarded-for", "x-real-ip"]) {
    const headerValue = requestHeaders.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
}

export async function resolveRequestAuth(requestHeaders: Headers): Promise<RequestAuthResult> {
  const cacheKey = getCacheKey(requestHeaders);
  const cached = readCachedAuth(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const res = await fetch(`${getServerApiBaseUrl()}/api/auth/get-session`, {
      credentials: "include",
      headers: buildApiRequestHeaders(requestHeaders),
    });

    if (res.status === 429) {
      const authResult: RequestAuthResult = {
        state: "rate_limited",
        user: null,
        retryAfterSeconds: parseRetryAfterSeconds(res.headers.get("Retry-After")),
      };
      writeCachedAuth(cacheKey, authResult);
      return authResult;
    }

    if (!res.ok) {
      const authResult: RequestAuthResult = { state: "error", user: null };
      writeCachedAuth(cacheKey, authResult);
      return authResult;
    }

    const data = await res.json().catch(() => null);
    const user = data?.user || null;
    const authResult: RequestAuthResult = user
      ? { state: "authenticated", user }
      : { state: "anonymous", user: null };

    writeCachedAuth(cacheKey, authResult);
    return authResult;
  } catch {
    const authResult: RequestAuthResult = { state: "error", user: null };
    writeCachedAuth(cacheKey, authResult);
    return authResult;
  }
}
