import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import {
  auth,
  authBaseUrl,
  authSecretConfigured,
  githubAuthConfigured,
  githubCallbackUrl,
  trustedOrigins,
  webUrl,
} from "./auth/index.js";
import { projectRoutes } from "./routes/projects.js";
import { sessionRoutes } from "./routes/sessions.js";
import { itemRoutes } from "./routes/items.js";
import { bundleRoutes } from "./routes/bundles.js";
import { actionRoutes } from "./routes/actions.js";
import { reviewRoutes } from "./routes/reviews.js";
import { testAuthRoutes } from "./routes/test-auth.js";
import { rateLimiter, type RateLimitKeyStrategy } from "./middleware/rate-limit.js";
import { authV1Routes } from "./routes/auth-v1.js";
import { buildOpenApiDocument } from "./lib/openapi.js";

interface RateLimitProfile {
  windowMs: number;
  max: number;
  keyStrategy: RateLimitKeyStrategy;
  label: string;
}

export const defaultRateLimitProfiles = {
  authGetSession: {
    windowMs: 60_000,
    max: 120,
    keyStrategy: "hybrid-session",
    label: "auth:get-session",
  },
  authStatus: {
    windowMs: 60_000,
    max: 60,
    keyStrategy: "ip",
    label: "auth:status",
  },
  authWrite: {
    windowMs: 60_000,
    max: 20,
    keyStrategy: "ip",
    label: "auth:write",
  },
  authOther: {
    windowMs: 60_000,
    max: 60,
    keyStrategy: "hybrid-session",
    label: "auth:other",
  },
  api: {
    windowMs: 60_000,
    max: 300,
    keyStrategy: "hybrid-session",
    label: "api",
  },
} satisfies Record<string, RateLimitProfile>;

type RateLimitProfileName = keyof typeof defaultRateLimitProfiles;

export interface CreateAppOptions {
  disableRateLimit?: boolean;
  rateLimits?: Partial<{
    [K in RateLimitProfileName]: Partial<RateLimitProfile>;
  }>;
}

function getRateLimitProfile(
  profileName: RateLimitProfileName,
  overrides?: CreateAppOptions["rateLimits"],
): RateLimitProfile {
  return {
    ...defaultRateLimitProfiles[profileName],
    ...(overrides?.[profileName] || {}),
  };
}

function isAuthWritePath(path: string): boolean {
  return path.startsWith("/api/auth/sign-in/") || path.startsWith("/api/auth/callback/");
}

function isAuthSpecialPath(path: string): boolean {
  return path === "/api/auth/get-session"
    || path === "/api/auth/status"
    || isAuthWritePath(path);
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono();

  // Security headers
  app.use("*", secureHeaders());

  // CORS for the web frontend
  app.use(
    "/api/*",
    cors({
      origin: process.env.WEB_URL || "http://localhost:4321",
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Body size limit (64KB)
  app.use("/api/*", bodyLimit({ maxSize: 64 * 1024 }));

  // Rate limiting (disabled in test mode unless explicitly enabled)
  if (!options.disableRateLimit && process.env.TEST_AUTH_BYPASS !== "true") {
    const authGetSession = getRateLimitProfile("authGetSession", options.rateLimits);
    const authStatus = getRateLimitProfile("authStatus", options.rateLimits);
    const authWrite = getRateLimitProfile("authWrite", options.rateLimits);
    const authOther = getRateLimitProfile("authOther", options.rateLimits);
    const api = getRateLimitProfile("api", options.rateLimits);

    app.use("/api/auth/get-session", rateLimiter(authGetSession));
    app.use("/api/auth/status", rateLimiter(authStatus));
    app.use("/api/auth/sign-in/*", rateLimiter(authWrite));
    app.use("/api/auth/callback/*", rateLimiter(authWrite));
    app.use(
      "/api/auth/*",
      rateLimiter({
        ...authOther,
        skip: (c) => isAuthSpecialPath(c.req.path),
      }),
    );
    app.use(
      "/api/*",
      rateLimiter({
        ...api,
        skip: (c) => c.req.path === "/api/health" || c.req.path === "/api/v1/health" || c.req.path.startsWith("/api/auth/"),
      }),
    );
  }

  // Health check
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/v1/health", (c) => c.json({ ok: true }));
  app.get("/api/v1/openapi.json", (c) => c.json(buildOpenApiDocument()));

  app.get("/api/auth/status", (c) => {
    const missingEnvVars: string[] = [];

    if (!process.env.BETTER_AUTH_SECRET?.trim()) {
      missingEnvVars.push("BETTER_AUTH_SECRET");
    }
    if (!process.env.GITHUB_CLIENT_ID?.trim()) {
      missingEnvVars.push("GITHUB_CLIENT_ID");
    }
    if (!process.env.GITHUB_CLIENT_SECRET?.trim()) {
      missingEnvVars.push("GITHUB_CLIENT_SECRET");
    }

    return c.json({
      githubConfigured: githubAuthConfigured,
      authSecretConfigured,
      readyForOAuth: githubAuthConfigured && authSecretConfigured,
      missingEnvVars,
      callbackUrl: githubCallbackUrl,
      apiUrl: authBaseUrl,
      webUrl,
      trustedOrigins,
    });
  });

  // Auth routes (better-auth handles /api/auth/*)
  app.all("/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
  });

  // Test-only auth bypass routes (guarded by env var)
  if (process.env.TEST_AUTH_BYPASS === "true") {
    app.route("/api", testAuthRoutes);
  }

  // Versioned product API routes
  app.route("/api/v1", authV1Routes);
  app.route("/api/v1", projectRoutes);
  app.route("/api/v1", sessionRoutes);
  app.route("/api/v1", itemRoutes);
  app.route("/api/v1", bundleRoutes);
  app.route("/api/v1", actionRoutes);
  app.route("/api/v1", reviewRoutes);

  return app;
}
