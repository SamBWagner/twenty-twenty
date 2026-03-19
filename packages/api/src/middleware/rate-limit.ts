import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

const SESSION_COOKIE_NAME = "better-auth.session_token";

export type RateLimitKeyStrategy = "ip" | "hybrid-session";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyStrategy?: RateLimitKeyStrategy;
  label?: string;
  skip?: (c: Context) => boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitIdentity {
  key: string;
  keyType: "session" | "ip" | "unknown";
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name) continue;

    const rawValue = rawValueParts.join("=");
    if (!rawValue) return null;
    return decodeCookieValue(rawValue);
  }

  return null;
}

export function hashRateLimitValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function extractClientIp(headers: Pick<Headers, "get">): string | null {
  const forwardedIp = headers.get("fly-client-ip")
    || headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || null;

  return forwardedIp || null;
}

export function deriveRateLimitIdentity(
  headers: Pick<Headers, "get">,
  keyStrategy: RateLimitKeyStrategy = "ip",
): RateLimitIdentity {
  if (keyStrategy === "hybrid-session") {
    const sessionToken = extractCookieValue(headers.get("cookie"), SESSION_COOKIE_NAME);
    if (sessionToken) {
      return {
        key: `session:${hashRateLimitValue(sessionToken)}`,
        keyType: "session",
      };
    }
  }

  const ip = extractClientIp(headers);
  if (ip) {
    return {
      key: `ip:${ip}`,
      keyType: "ip",
    };
  }

  return {
    key: "unknown",
    keyType: "unknown",
  };
}

function setRateLimitHeaders(c: Context, max: number, count: number, resetAt: number, blocked: boolean) {
  const remaining = blocked ? 0 : Math.max(0, max - count);

  c.header("X-RateLimit-Limit", String(max));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

export function rateLimiter(opts: RateLimitOptions): MiddlewareHandler {
  const store = new Map<string, RateLimitEntry>();
  const label = opts.label || "rate-limit";
  const keyStrategy = opts.keyStrategy || "ip";

  // Periodic cleanup to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, opts.windowMs).unref();

  return async (c, next) => {
    if (opts.skip?.(c)) {
      await next();
      return;
    }

    const { key, keyType } = deriveRateLimitIdentity(c.req.raw.headers, keyStrategy);

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      const nextEntry = { count: 1, resetAt: now + opts.windowMs };
      store.set(key, nextEntry);
      setRateLimitHeaders(c, opts.max, nextEntry.count, nextEntry.resetAt, false);
      await next();
      return;
    }

    entry.count++;

    if (entry.count > opts.max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      setRateLimitHeaders(c, opts.max, entry.count, entry.resetAt, true);
      c.header("Retry-After", String(retryAfterSeconds));
      console.warn("[rate-limit] blocked", {
        label,
        method: c.req.method,
        path: c.req.path,
        keyType,
        retryAfterSeconds,
      });
      return c.json({ error: "Too many requests" }, 429);
    }

    setRateLimitHeaders(c, opts.max, entry.count, entry.resetAt, false);
    await next();
  };
}
